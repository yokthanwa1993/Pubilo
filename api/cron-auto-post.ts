import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';
// @ts-ignore
import FB from 'fb';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || "";

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

interface AutoPostConfig {
  page_id: string;
  auto_schedule: boolean;
  schedule_minutes: string;
  working_hours_start: number;
  working_hours_end: number;
  post_token: string | null;
  post_mode: 'image' | 'text' | 'alternate' | null;
  color_bg: boolean;
  share_page_id: string | null;
  share_mode: 'both' | 'image' | 'text' | null;
  share_schedule_minutes: string | null;
  color_bg_presets: string | null;
  color_bg_index: number;
  page_color: string | null;
  page_name: string | null;
  last_post_type: 'text' | 'image' | null;
  image_source: 'ai' | 'og' | null;
  og_background_url: string | null;
  og_font: string | null;
}

interface Quote {
  id: string;
  quote_text: string;
  used_by_pages: string[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS for browser testing
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify cron secret (optional - skip if no secret set or if "test" header)
  const authHeader = req.headers['authorization'];
  const isTest = authHeader === 'Bearer test';
  const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.CRON_SECRET && !isValidCron && !isTest) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!dbUrl) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const now = new Date();
    const nowStr = now.toISOString();
    const forcePost = req.query.force === 'true' || isTest;
    
    // Get current minute in Thailand time (UTC+7)
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const currentMinute = thaiNow.getUTCMinutes();
    const currentHour = thaiNow.getUTCHours();
    
    console.log(`[cron-auto-post] Running at ${nowStr} (Thai: ${currentHour}:${currentMinute.toString().padStart(2, '0')})`);
    
    // Clear share_queue at midnight (00:00)
    if (currentHour === 0 && currentMinute === 0) {
      const deleted = await sql`DELETE FROM share_queue WHERE status = 'pending' RETURNING id`;
      console.log(`[cron-auto-post] Cleared ${deleted.length} pending shares at midnight`);
    }
    
    // Get all enabled configs from page_settings
    const configs = await sql<AutoPostConfig[]>`
      SELECT * FROM page_settings WHERE auto_schedule = true AND post_mode IS NOT NULL
    `;
    
    if (!configs || configs.length === 0) {
      await sql.end();
      return res.status(200).json({ success: true, message: 'No enabled configs', processed: 0 });
    }
    
    // Filter configs that should post NOW (current minute matches schedule)
    const dueConfigs = configs.filter(config => {
      // Skip if no post_mode set
      if (!config.post_mode) return false;
      
      if (forcePost) return true;
      
      const scheduleMinutes = (config.schedule_minutes || '00, 05, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55')
        .split(',')
        .map(m => parseInt(m.trim()))
        .filter(m => !isNaN(m));
      
      const workingStart = config.working_hours_start ?? 6;
      const workingEnd = config.working_hours_end ?? 24;
      
      // Check if current hour is within working hours
      const isInWorkingHours = currentHour >= workingStart && currentHour < workingEnd;
      
      // Check if current minute matches schedule
      const isScheduledMinute = scheduleMinutes.includes(currentMinute);
      
      console.log(`[cron-auto-post] Page ${config.page_id}: minute=${currentMinute}, scheduled=${scheduleMinutes.join(',')}, workingHours=${workingStart}-${workingEnd}, inHours=${isInWorkingHours}, match=${isScheduledMinute}`);
      
      return isInWorkingHours && isScheduledMinute;
    });

    if (dueConfigs.length === 0) {
      await sql.end();
      return res.status(200).json({ success: true, message: 'No posts due at this minute', processed: 0 });
    }

    console.log(`[cron-auto-post] Processing ${dueConfigs.length} due auto-posts (posting immediately)`);

    let processed = 0;
    const results: any[] = [];

    for (const config of dueConfigs) {
      try {
        // Add small delay between processing to prevent race conditions
        if (processed > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }

        if (!config.post_token) {
          console.log(`[cron-auto-post] No post_token for page ${config.page_id}, skipping`);
          results.push({ page_id: config.page_id, status: 'skipped', reason: 'no_token' });
          continue;
        }

        // Fetch unused quote (Global mode - not used by ANY page, newest first)
        const quotes = await sql<Quote[]>`
          SELECT id, quote_text, used_by_pages FROM quotes ORDER BY created_at DESC
        `;

        const unusedQuote = quotes.find(q => {
          const usedBy = q.used_by_pages || [];
          return usedBy.length === 0; // Global mode: must not be used by any page
        });

        if (!unusedQuote) {
          console.log(`[cron-auto-post] No unused quotes for page ${config.page_id}`);
          results.push({ page_id: config.page_id, status: 'skipped', reason: 'no_quotes' });
          continue;
        }

        // Get page settings for image generation
        const settingsResult = await sql`
          SELECT image_image_size, ai_model, ai_resolution FROM page_settings WHERE page_id = ${config.page_id} LIMIT 1
        `;
        const settings = settingsResult[0];
        const aiModel = settings?.ai_model || 'gemini-2.0-flash-exp';
        const aiResolution = settings?.ai_resolution || '2K';
        const imageSize = settings?.image_image_size || '1:1';
        
        console.log(`[cron-auto-post] Page ${config.page_id} settings: model=${aiModel}, resolution=${aiResolution}, size=${imageSize}`);

        // Determine post type based on post_mode
        const postMode = config.post_mode && config.post_mode.trim() ? config.post_mode : 'image';
        let nextPostType: 'text' | 'image';
        
        if (postMode === 'text') {
          nextPostType = 'text';
        } else if (postMode === 'image') {
          nextPostType = 'image';
        } else if (postMode === 'alternate') {
          // alternate mode
          nextPostType = config.last_post_type === 'text' ? 'image' : 'text';
        } else {
          // default to image
          nextPostType = 'image';
        }
        
        console.log(`[cron-auto-post] Page ${config.page_id}: postMode=${postMode}, nextPostType=${nextPostType}`);

        let facebookPostId: string;

        if (nextPostType === 'text') {
          // Get preset ID for colored background
          let presetId: string | null = null;
          if (config.color_bg) {
            const presets = (config.color_bg_presets || '1881421442117417').split(',').map(s => s.trim()).filter(s => s);
            if (presets.length > 0) {
              const index = config.color_bg_index || 0;
              presetId = presets[index % presets.length];
              // Update index for next post
              await sql`UPDATE page_settings SET color_bg_index = ${(index + 1) % presets.length} WHERE page_id = ${config.page_id}`;
            }
          }
          
          // Create text-only post (immediate - no scheduledTime)
          facebookPostId = await createTextPost(config.page_id, config.post_token, unusedQuote.quote_text, presetId);
        } else {
          // Create image post (immediate)
          let imageUrl: string;

          const imageSource = config.image_source || 'ai';
          console.log(`[cron-auto-post] Page ${config.page_id}: imageSource=${imageSource}`);

          if (imageSource === 'og' && config.og_background_url) {
            // Use OG Image Generator
            const ogFont = config.og_font || 'noto-sans-thai';
            imageUrl = await generateOGImage(unusedQuote.quote_text, config.og_background_url, ogFont);
          } else {
            // Use AI (Gemini) to generate image
            const customPrompt = await getImagePrompt(sql, config.page_id);
            const pageName = await getPageName(sql, config.page_id);

            // Generate AI image with page settings
            const base64Image = await generateAIImage(
              unusedQuote.quote_text,
              customPrompt || undefined,
              imageSize,
              pageName || undefined,
              aiModel,
              aiResolution
            );

            // Upload to image host
            imageUrl = await uploadImageToHost(base64Image);
          }

          // Post to Facebook (immediate - no scheduledTime)
          facebookPostId = await createImagePost(
            config.page_id,
            config.post_token,
            imageUrl,
            unusedQuote.quote_text
          );
        }

        // Update config state
        await sql`
          UPDATE page_settings
          SET last_post_type = ${nextPostType},
              updated_at = ${nowStr}
          WHERE page_id = ${config.page_id}
        `;

        // Mark quote as used
        const usedByPages: string[] = unusedQuote.used_by_pages || [];
        if (!usedByPages.includes(config.page_id)) {
          usedByPages.push(config.page_id);
        }
        await sql`
          UPDATE quotes SET used_by_pages = ${usedByPages} WHERE id = ${unusedQuote.id}
        `;

        // Log to auto_post_logs (quote_id as text since quotes table uses integer)
        await sql`
          INSERT INTO auto_post_logs (page_id, post_type, quote_text, status, facebook_post_id)
          VALUES (${config.page_id}, ${nextPostType}, ${unusedQuote.quote_text}, 'success', ${facebookPostId})
        `;

        // Queue share to another page if configured (instead of sharing immediately)
        if (config.share_page_id && facebookPostId) {
          try {
            const shareMode = config.share_mode || 'both';
            let shouldQueue = false;
            
            if (shareMode === 'both') {
              shouldQueue = true;
            } else if (shareMode === 'image' && nextPostType === 'image') {
              shouldQueue = true;
            } else if (shareMode === 'text' && nextPostType === 'text') {
              shouldQueue = true;
            }
            
            if (shouldQueue) {
              await sql`
                INSERT INTO share_queue (source_page_id, target_page_id, facebook_post_id, post_type)
                VALUES (${config.page_id}, ${config.share_page_id}, ${facebookPostId}, ${nextPostType})
              `;
              console.log(`[cron-auto-post] Queued share to page ${config.share_page_id} (mode: ${shareMode})`);
            }
          } catch (shareErr) {
            console.error(`[cron-auto-post] Failed to queue share:`, shareErr);
          }
        }

        processed++;
        results.push({ page_id: config.page_id, status: 'success', post_type: nextPostType, post_id: facebookPostId });
        console.log(`[cron-auto-post] Successfully posted ${nextPostType} for page ${config.page_id}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[cron-auto-post] Error for page ${config.page_id}:`, errorMessage);
        results.push({ page_id: config.page_id, status: 'failed', error: errorMessage });
        
        // Log failure
        await sql`
          INSERT INTO auto_post_logs (page_id, post_type, quote_text, status, error_message)
          VALUES (${config.page_id}, 'image', null, 'failed', ${errorMessage})
        `.catch(() => {});
      }
    }

    // Process share queue - check source pages' share_schedule_minutes
    const shareResults: any[] = [];
    try {
      // Get distinct source pages with pending shares
      const sourcePagesWithPending = await sql`
        SELECT DISTINCT sq.source_page_id, ac.share_schedule_minutes
        FROM share_queue sq
        JOIN page_settings ac ON sq.source_page_id = ac.page_id
        WHERE sq.status = 'pending'
      `;
      
      for (const source of sourcePagesWithPending) {
        const shareSchedule = source.share_schedule_minutes || '';
        if (!shareSchedule.trim()) continue;
        
        const shareMins = shareSchedule
          .split(',')
          .map((m: string) => parseInt(m.trim()))
          .filter((m: number) => !isNaN(m));
        
        if (shareMins.length === 0) continue;
        if (!shareMins.includes(currentMinute) && !forcePost) continue;
        
        // Get ONE pending item for this source page
        const pendingItems = await sql`
          SELECT sq.id, sq.target_page_id, sq.facebook_post_id, ac_target.post_token as target_token
          FROM share_queue sq
          JOIN page_settings ac_target ON sq.target_page_id = ac_target.page_id
          WHERE sq.source_page_id = ${source.source_page_id} AND sq.status = 'pending'
          ORDER BY sq.created_at ASC
          LIMIT 1
        `;
        
        if (pendingItems.length === 0) continue;
        const item = pendingItems[0];
        if (!item.target_token) continue;
        
        try {
          const sharedPostId = await sharePost(item.facebook_post_id, item.target_page_id, item.target_token);
          await sql`UPDATE share_queue SET status = 'shared', shared_at = NOW(), shared_post_id = ${sharedPostId} WHERE id = ${item.id}`;
          shareResults.push({ source_page_id: source.source_page_id, target_page_id: item.target_page_id, post_id: item.facebook_post_id, shared_post_id: sharedPostId, status: 'shared' });
          console.log(`[cron-auto-post] Shared queued post ${item.facebook_post_id} to page ${item.target_page_id}, shared_post_id: ${sharedPostId}`);
        } catch (err) {
          await sql`UPDATE share_queue SET status = 'failed' WHERE id = ${item.id}`;
          console.error(`[cron-auto-post] Failed to share queued post:`, err);
        }
      }
    } catch (err) {
      console.error('[cron-auto-post] Error processing share queue:', err);
    }

    await sql.end();
    return res.status(200).json({ success: true, processed, results, shareResults });

  } catch (error) {
    await sql.end();
    console.error('[cron-auto-post] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper functions using Facebook SDK
async function createTextPost(pageId: string, postToken: string, message: string, presetId: string | null = null): Promise<string> {
  console.log(`[cron-auto-post] Creating text post via SDK for page ${pageId}, presetId: ${presetId}`);

  FB.setAccessToken(postToken);
  
  const params: any = { message };
  if (presetId) {
    params.text_format_preset_id = presetId;
  }

  return new Promise((resolve, reject) => {
    FB.api(`/${pageId}/feed`, 'POST', params, (response: any) => {
      if (!response || response.error) {
        reject(new Error(response?.error?.message || 'Facebook API error'));
      } else {
        resolve(response.id);
      }
    });
  });
}

async function createImagePost(pageId: string, postToken: string, imageUrl: string, message: string): Promise<string> {
  console.log(`[cron-auto-post] Creating image post via SDK for page ${pageId}`);

  FB.setAccessToken(postToken);

  return new Promise((resolve, reject) => {
    FB.api(`/${pageId}/photos`, 'POST', { url: imageUrl, caption: message }, (response: any) => {
      if (!response || response.error) {
        reject(new Error(response?.error?.message || 'Facebook API error'));
      } else {
        resolve(response.post_id || response.id);
      }
    });
  });
}

async function sharePost(postId: string, targetPageId: string, targetPageToken: string): Promise<string> {
  console.log(`[cron-auto-post] Sharing post ${postId} to page ${targetPageId} via SDK`);

  FB.setAccessToken(targetPageToken);

  return new Promise((resolve, reject) => {
    FB.api(`/${targetPageId}/feed`, 'POST', { link: `https://www.facebook.com/${postId}` }, (response: any) => {
      if (!response || response.error) {
        reject(new Error(response?.error?.message || 'Share failed'));
      } else {
        resolve(response.id);
      }
    });
  });
}

async function generateAIImage(
  quoteText: string,
  customPrompt?: string,
  aspectRatio?: string,
  pageName?: string,
  aiModel?: string,
  aiResolution?: string
): Promise<string> {
  // Use settings from database, fallback to manual defaults
  const model = aiModel || 'gemini-2.0-flash-exp';
  const finalAspectRatio = aspectRatio || '1:1';
  const finalResolution = aiResolution || '2K';
  
  console.log(`[cron-auto-post] Generating AI image - model: ${model}, resolution: ${finalResolution}, aspectRatio: ${finalAspectRatio}`);

  let textPrompt: string;

  if (customPrompt && customPrompt.trim()) {
    textPrompt = customPrompt
      .replace(/\{\{QUOTE\}\}/g, quoteText)
      .replace(/\{\{PAGE_NAME\}\}/g, pageName || '');

    // Same dimension mapping as manual
    const aspectDimensions: Record<string, string> = {
      '1:1': '1024x1024 pixels (square)',
      '2:3': '1024x1536 pixels (portrait/vertical)',
      '3:2': '1536x1024 pixels (landscape/horizontal)',
      '4:5': '1024x1280 pixels (portrait)',
      '5:4': '1280x1024 pixels (landscape)',
      '9:16': '1024x1820 pixels (vertical story)',
      '16:9': '1820x1024 pixels (horizontal widescreen)',
    };
    const dimensionDesc = aspectDimensions[finalAspectRatio] || `${finalAspectRatio} ratio`;

    textPrompt += `\n\n**CRITICAL IMAGE DIMENSIONS (MUST FOLLOW):**
- **Aspect Ratio: ${finalAspectRatio}** → Generate image with ${dimensionDesc}
- This is a ${finalAspectRatio.includes(':') && parseInt(finalAspectRatio.split(':')[0]) < parseInt(finalAspectRatio.split(':')[1]) ? 'PORTRAIT/VERTICAL' : finalAspectRatio === '1:1' ? 'SQUARE' : 'LANDSCAPE/HORIZONTAL'} image
- Resolution: ${finalResolution}
- สร้างแค่ 1 รูปเดียว ห้ามสร้าง grid, collage, 2x2, 4 รูปใน 1 ภาพ`;
  } else {
    // Use exact same default prompt as manual
    textPrompt = `สร้างรูปภาพ 1 รูป สำหรับโพสต์ Facebook ที่มีลักษณะดังนี้:

**สำคัญมาก - ข้อห้าม:**
- ห้ามสร้างรูปแบบ grid, collage หรือหลายรูปใน 1 ภาพ
- ต้องเป็นรูปเดียวเท่านั้น ไม่ใช่ 2x2, 4 รูป หรือ split screen

**พื้นหลัง:**
- ภาพถ่ายธรรมชาติสวยงาม เช่น พระอาทิตย์ตก/ขึ้น ภูเขา ทะเล ท้องฟ้า หมอก ทุ่งหญ้า
- สีโทนอบอุ่น gradient จากส้มทอง เหลือง ไปฟ้าอ่อน

**ข้อความภาษาไทย:**
"${quoteText}"

**การจัดวางข้อความ:**
- ข้อความอยู่ตรงกลางรูป
- ฟอนต์หนา ตัวใหญ่ อ่านง่าย
- สีข้อความเป็นสีเข้ม มีเงาเล็กน้อย

**สไตล์:** Quote/คำคม สำหรับ Social Media ไทย`;
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: textPrompt }] }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const result = await response.json();

  if (result.candidates?.[0]?.content?.parts) {
    for (const part of result.candidates[0].content.parts) {
      if (part.inlineData?.data) {
        const base64 = part.inlineData.data;
        const mimeType = part.inlineData.mimeType || 'image/png';
        return `data:${mimeType};base64,${base64}`;
      }
    }
  }

  throw new Error('No image generated from Gemini');
}

async function uploadImageToHost(base64Data: string): Promise<string> {
  console.log('[cron-auto-post] Uploading image to freeimage.host...');

  const base64Only = base64Data.replace(/^data:image\/\w+;base64,/, '');

  const formData = new FormData();
  formData.append('key', FREEIMAGE_API_KEY);
  formData.append('source', base64Only);
  formData.append('format', 'json');

  const response = await fetch('https://freeimage.host/api/1/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: ${response.status}`);
  }

  const result = await response.json();
  if (!result.image?.url) {
    throw new Error('No URL returned from image host');
  }

  return result.image.url;
}

async function generateOGImage(quoteText: string, backgroundUrl: string, font: string = 'noto-sans-thai'): Promise<string> {
  console.log(`[cron-auto-post] Generating OG image with font: ${font}...`);

  const params = new URLSearchParams({
    text: quoteText,
    font: font,
    image: backgroundUrl,
    output: 'json'
  });

  const ogUrl = `https://og-image-azure.vercel.app/api/og?${params.toString()}`;

  const response = await fetch(ogUrl);

  if (!response.ok) {
    throw new Error(`OG Image generation failed: ${response.status}`);
  }

  const result = await response.json();

  // The OG service returns the image URL in result.image.url
  if (!result.image?.url) {
    throw new Error('No URL returned from OG Image service');
  }

  console.log('[cron-auto-post] OG image generated:', result.image.url);
  return result.image.url;
}

async function getImagePrompt(sql: any, pageId: string): Promise<string | null> {
  const result = await sql`
    SELECT prompt_text FROM prompts
    WHERE page_id = ${pageId} AND prompt_type = 'image_post'
    LIMIT 1
  `;
  return result[0]?.prompt_text || null;
}

async function getPageName(sql: any, pageId: string): Promise<string | null> {
  try {
    // First try to get from page_settings
    const result = await sql`
      SELECT page_name, post_token FROM page_settings WHERE page_id = ${pageId} LIMIT 1
    `;
    
    if (result[0]?.page_name) {
      return result[0].page_name;
    }
    
    // If no page_name stored, fetch from Facebook Graph API
    const postToken = result[0]?.post_token;
    if (postToken) {
      try {
        const response = await fetch(
          `https://graph.facebook.com/v21.0/${pageId}?fields=name&access_token=${postToken}`
        );
        if (response.ok) {
          const data = await response.json();
          const pageName = data.name;
          
          // Update database with fetched name
          if (pageName) {
            await sql`
              UPDATE page_settings 
              SET page_name = ${pageName}, updated_at = ${new Date().toISOString()}
              WHERE page_id = ${pageId}
            `;
            console.log(`[cron-auto-post] Updated page_name for ${pageId}: ${pageName}`);
            return pageName;
          }
        }
      } catch (error) {
        console.error(`[cron-auto-post] Failed to fetch page name from Facebook:`, error);
      }
    }
    
    return null;
  } catch {
    return null;
  }
}

