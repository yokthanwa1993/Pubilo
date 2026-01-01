import { createClient } from '@supabase/supabase-js';
import postgres from 'postgres';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Use postgres directly for new tables (auto_post_config, auto_post_logs) since Supabase schema cache may not have them
const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";
const sql = dbUrl ? postgres(dbUrl, { ssl: 'require' }) : null;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || "";

interface AutoPostConfig {
  id: string;
  page_id: string;
  enabled: boolean;
  interval_minutes: number;
  last_post_type: 'text' | 'image' | null;
  last_post_at: string | null;
  next_post_at: string | null;
  post_token: string | null;
}

interface Quote {
  id: string;
  quote_text: string;
  used_by_pages: string[];
}

// Fetch unused quote for a page
async function getUnusedQuote(pageId: string): Promise<Quote | null> {
  const { data, error } = await supabase
    .from('quotes')
    .select('id, quote_text, used_by_pages')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[auto-post] Error fetching quotes:', error);
    return null;
  }

  // Find first quote not used by this page
  const unusedQuote = (data || []).find(q => {
    const usedBy = q.used_by_pages || [];
    return !usedBy.includes(pageId);
  });

  return unusedQuote || null;
}

// Mark quote as used by page
async function markQuoteAsUsed(quoteId: string, pageId: string): Promise<void> {
  // First get current used_by_pages
  const { data: quote } = await supabase
    .from('quotes')
    .select('used_by_pages')
    .eq('id', quoteId)
    .single();

  const usedByPages: string[] = quote?.used_by_pages || [];
  if (!usedByPages.includes(pageId)) {
    usedByPages.push(pageId);
  }

  await supabase
    .from('quotes')
    .update({ used_by_pages: usedByPages })
    .eq('id', quoteId);
}

// Log auto post result using postgres directly
async function logAutoPost(
  pageId: string,
  postType: 'text' | 'image',
  quoteId: string | null,
  quoteText: string | null,
  status: 'success' | 'failed',
  facebookPostId?: string,
  errorMessage?: string
): Promise<void> {
  if (!sql) {
    console.error('[auto-post] Cannot log - no database connection');
    return;
  }
  await sql`
    INSERT INTO auto_post_logs (page_id, post_type, quote_id, quote_text, status, facebook_post_id, error_message)
    VALUES (${pageId}, ${postType}, ${quoteId}::uuid, ${quoteText}, ${status}, ${facebookPostId || null}, ${errorMessage || null})
  `;
}

// Create text-only post via Facebook Graph API
async function createTextPost(pageId: string, postToken: string, message: string): Promise<string> {
  console.log(`[auto-post] Creating text post for page ${pageId}`);

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message,
        access_token: postToken,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log(`[auto-post] Text post created: ${result.id}`);
  return result.id;
}

// Fetch page name from pages table
async function getPageName(pageId: string): Promise<string | null> {
  const { data } = await supabase
    .from('pages')
    .select('page_name')
    .eq('page_id', pageId)
    .single();

  return data?.page_name || null;
}

// Generate AI image using Gemini
async function generateAIImage(quoteText: string, customPrompt?: string, aspectRatio?: string, pageName?: string): Promise<string> {
  console.log(`[auto-post] Generating AI image for quote: ${quoteText.substring(0, 50)}...`);

  // Build prompt
  let textPrompt: string;
  const finalAspectRatio = aspectRatio || '1:1';
  const finalResolution = '2K';

  if (customPrompt && customPrompt.trim()) {
    // Use custom prompt template - replace placeholders
    textPrompt = customPrompt
      .replace(/\{\{QUOTE\}\}/g, quoteText)
      .replace(/\{\{PAGE_NAME\}\}/g, pageName || '');

    // Append technical parameters automatically (user doesn't need to add these to prompt)
    // Convert aspect ratio to explicit dimensions for better AI understanding
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
    console.log('[auto-post] Using custom prompt with auto-appended aspect ratio:', finalAspectRatio, dimensionDesc);
  } else {
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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: textPrompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE', 'TEXT'],
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  const result = await response.json();

  // Extract base64 image from response
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

// Upload base64 image to freeimage.host
async function uploadImageToHost(base64Data: string): Promise<string> {
  console.log('[auto-post] Uploading image to freeimage.host...');

  // Extract just the base64 data (remove data:image/xxx;base64, prefix)
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

  console.log(`[auto-post] Image uploaded: ${result.image.url}`);
  return result.image.url;
}

// Create image post via Facebook Graph API
async function createImagePost(
  pageId: string,
  postToken: string,
  imageUrl: string,
  message: string
): Promise<string> {
  console.log(`[auto-post] Creating image post for page ${pageId}`);

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/photos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: imageUrl,
        caption: message,
        access_token: postToken,
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  console.log(`[auto-post] Image post created: ${result.post_id || result.id}`);
  return result.post_id || result.id;
}

// Get custom prompt for image posts
async function getImagePrompt(pageId: string): Promise<string | null> {
  const { data } = await supabase
    .from('prompts')
    .select('prompt_text')
    .eq('page_id', pageId)
    .eq('prompt_type', 'image_post')
    .single();

  return data?.prompt_text || null;
}

// Get page settings for aspect ratio and schedule
async function getPageSettings(pageId: string): Promise<{ image_image_size?: string; schedule_minutes?: string } | null> {
  const { data } = await supabase
    .from('page_settings')
    .select('image_image_size, schedule_minutes')
    .eq('page_id', pageId)
    .single();

  return data;
}

// Main scheduler function - called every 30 seconds
export async function processAutoPosting(): Promise<void> {
  if (!sql) {
    console.error('[auto-post] No database connection available');
    return;
  }

  const now = new Date().toISOString();

  try {
    // Query configs where enabled=true AND next_post_at <= NOW() using postgres directly
    const dueConfigs = await sql<AutoPostConfig[]>`
      SELECT * FROM auto_post_config
      WHERE enabled = true AND next_post_at <= ${now}
    `;

    if (!dueConfigs || dueConfigs.length === 0) {
      return; // No posts due
    }

    console.log(`[auto-post] Processing ${dueConfigs.length} due auto-posts`);

    for (const config of dueConfigs) {
      let quote: Quote | null = null;
      let nextPostType: 'text' | 'image' = 'text';

      try {
        // Check for post_token
        if (!config.post_token) {
          console.log(`[auto-post] No post_token for page ${config.page_id}, skipping`);
          continue;
        }

        // Determine next post type (alternate from last)
        nextPostType = config.last_post_type === 'text' ? 'image' : 'text';
        console.log(`[auto-post] Page ${config.page_id}: next post type = ${nextPostType}`);

        // Fetch unused quote
        quote = await getUnusedQuote(config.page_id);
        if (!quote) {
          console.log(`[auto-post] No unused quotes for page ${config.page_id}`);
          await logAutoPost(config.page_id, nextPostType, null, null, 'failed', undefined, 'No unused quotes available');

          // Disable auto-post since no quotes available
          await sql`
            UPDATE auto_post_config
            SET enabled = false, updated_at = ${new Date().toISOString()}
            WHERE id = ${config.id}::uuid
          `;
          continue;
        }

      // Get page settings for interval and image settings
      const settings = await getPageSettings(config.page_id);
      let facebookPostId: string;

      if (nextPostType === 'text') {
        // Create text-only post
        facebookPostId = await createTextPost(
          config.page_id,
          config.post_token,
          quote.quote_text
        );
      } else {
        // Create image post
        const customPrompt = await getImagePrompt(config.page_id);
        const pageName = await getPageName(config.page_id);

        // Generate AI image
        const base64Image = await generateAIImage(
          quote.quote_text,
          customPrompt || undefined,
          settings?.image_image_size || '1:1',
          pageName || undefined
        );

        // Upload to image host
        const imageUrl = await uploadImageToHost(base64Image);

        // Post to Facebook
        facebookPostId = await createImagePost(
          config.page_id,
          config.post_token,
          imageUrl,
          quote.quote_text
        );
      }

      // Update config state using postgres directly
      // Get interval from page_settings (shared with Auto Schedule Posts)
      const intervalMins = settings?.schedule_minutes ? parseInt(settings.schedule_minutes) : 60;
      const nextPostAt = new Date(Date.now() + intervalMins * 60 * 1000).toISOString();
      const nowStr = new Date().toISOString();
      await sql`
        UPDATE auto_post_config
        SET last_post_type = ${nextPostType},
            last_post_at = ${nowStr},
            next_post_at = ${nextPostAt},
            updated_at = ${nowStr}
        WHERE id = ${config.id}::uuid
      `;

      // Mark quote as used
      await markQuoteAsUsed(quote.id, config.page_id);

      // Log success
      await logAutoPost(
        config.page_id,
        nextPostType,
        quote.id,
        quote.quote_text,
        'success',
        facebookPostId
      );

      console.log(`[auto-post] Successfully posted ${nextPostType} for page ${config.page_id}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[auto-post] Error for page ${config.page_id}:`, errorMessage);

        // Log failure
        await logAutoPost(
          config.page_id,
          nextPostType,
          quote?.id || null,
          quote?.quote_text || null,
          'failed',
          undefined,
          errorMessage
        );

        // Calculate next retry time (add 5 minutes on failure)
        const retryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await sql`
          UPDATE auto_post_config
          SET next_post_at = ${retryTime}, updated_at = ${new Date().toISOString()}
          WHERE id = ${config.id}::uuid
        `;
      }
    }
  } catch (err) {
    console.error('[auto-post] Error in processAutoPosting:', err);
  }
}
