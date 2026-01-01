import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY || "";

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

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

// Get scheduled posts from Facebook to check which time slots are taken
async function getScheduledPosts(pageId: string, pageToken: string): Promise<number[]> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/scheduled_posts?fields=scheduled_publish_time&access_token=${pageToken}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    // Return array of scheduled timestamps (in seconds)
    return (data.data || []).map((post: any) => parseInt(post.scheduled_publish_time));
  } catch {
    return [];
  }
}

// Find next available time slot from schedule that's not already taken on Facebook
function findNextAvailableTime(scheduleMinutesStr: string, scheduledTimestamps: number[]): Date {
  const scheduledMinutes = scheduleMinutesStr
    .split(',')
    .map(m => parseInt(m.trim()))
    .filter(m => !isNaN(m) && m >= 0 && m < 60)
    .sort((a, b) => a - b);

  if (scheduledMinutes.length === 0) {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  const now = new Date();
  // Facebook requires at least 10 minutes - we use 15 for safety buffer
  const minTime = new Date(now.getTime() + 15 * 60 * 1000);

  // Check slots for next 24 hours
  for (let hourOffset = 0; hourOffset < 24; hourOffset++) {
    for (const minute of scheduledMinutes) {
      const candidate = new Date(now);
      candidate.setUTCHours(now.getUTCHours() + hourOffset, minute, 0, 0);

      // Skip if in the past or too soon
      if (candidate.getTime() < minTime.getTime()) continue;

      // Check if this slot is already taken
      const candidateTimestamp = Math.floor(candidate.getTime() / 1000);
      const isTaken = scheduledTimestamps.some(ts => Math.abs(ts - candidateTimestamp) < 60);

      if (!isTaken) {
        console.log(`[cron-auto-post] Found available slot: ${candidate.toISOString()}`);
        return candidate;
      }
    }
  }

  // Fallback: 1 hour from now
  return new Date(Date.now() + 60 * 60 * 1000);
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
    // Schedule 15 minutes early to allow Facebook's 10-minute minimum
    const scheduleWindowEnd = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    console.log('[cron-auto-post] Running at', nowStr, '- looking for posts due before', scheduleWindowEnd);

    // Query configs where enabled=true AND next_post_at is within 15 minutes
    const dueConfigs = await sql<AutoPostConfig[]>`
      SELECT * FROM auto_post_config
      WHERE enabled = true AND next_post_at <= ${scheduleWindowEnd}
    `;

    if (!dueConfigs || dueConfigs.length === 0) {
      await sql.end();
      return res.status(200).json({ success: true, message: 'No posts due', processed: 0 });
    }

    console.log(`[cron-auto-post] Processing ${dueConfigs.length} due auto-posts`);

    let processed = 0;
    const results: any[] = [];

    for (const config of dueConfigs) {
      try {
        if (!config.post_token) {
          console.log(`[cron-auto-post] No post_token for page ${config.page_id}, skipping`);
          results.push({ page_id: config.page_id, status: 'skipped', reason: 'no_token' });
          continue;
        }

        // Skip if next_post_at is more than 15 minutes in the future (not due yet)
        if (config.next_post_at) {
          const nextPostTime = new Date(config.next_post_at).getTime();
          const timeUntilPost = nextPostTime - Date.now();
          if (timeUntilPost > 15 * 60 * 1000) {
            console.log(`[cron-auto-post] Skipping page ${config.page_id} - next post in ${Math.round(timeUntilPost/60000)} mins`);
            results.push({ page_id: config.page_id, status: 'skipped', reason: 'not_due' });
            continue;
          }
        }

        // Determine next post type (alternate from last)
        const nextPostType = config.last_post_type === 'text' ? 'image' : 'text';
        console.log(`[cron-auto-post] Page ${config.page_id}: next post type = ${nextPostType}`);

        // Fetch unused quote
        const quotes = await sql<Quote[]>`
          SELECT id, quote_text, used_by_pages FROM quotes ORDER BY created_at ASC
        `;

        const unusedQuote = quotes.find(q => {
          const usedBy = q.used_by_pages || [];
          return !usedBy.includes(config.page_id);
        });

        if (!unusedQuote) {
          console.log(`[cron-auto-post] No unused quotes for page ${config.page_id}`);
          // Disable auto-post since no quotes available
          await sql`
            UPDATE auto_post_config
            SET enabled = false, updated_at = ${nowStr}
            WHERE id = ${config.id}::uuid
          `;
          results.push({ page_id: config.page_id, status: 'disabled', reason: 'no_quotes' });
          continue;
        }

        // Get page settings for schedule and image generation
        const settingsResult = await sql`
          SELECT schedule_minutes, image_image_size, ai_model, ai_resolution FROM page_settings WHERE page_id = ${config.page_id} LIMIT 1
        `;
        const settings = settingsResult[0];
        const scheduleMinutesStr = settings?.schedule_minutes || '00, 15, 30, 45';
        const aiModel = settings?.ai_model || 'gemini-2.0-flash-exp';
        const aiResolution = settings?.ai_resolution || '2K';
        const imageSize = settings?.image_image_size || '1:1';

        // Get scheduled posts from Facebook to find available time slot
        const scheduledTimestamps = await getScheduledPosts(config.page_id, config.post_token);
        console.log(`[cron-auto-post] Found ${scheduledTimestamps.length} existing scheduled posts on Facebook`);

        // Find next available time slot that's not taken
        const scheduledTime = findNextAvailableTime(scheduleMinutesStr, scheduledTimestamps);
        console.log(`[cron-auto-post] Scheduling post for: ${scheduledTime.toISOString()}`);

        let facebookPostId: string;

        if (nextPostType === 'text') {
          // Create text-only post (scheduled)
          facebookPostId = await createTextPost(config.page_id, config.post_token, unusedQuote.quote_text, scheduledTime);
        } else {
          // Create image post
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
          const imageUrl = await uploadImageToHost(base64Image);

          // Post to Facebook (scheduled)
          facebookPostId = await createImagePost(
            config.page_id,
            config.post_token,
            imageUrl,
            unusedQuote.quote_text,
            scheduledTime
          );
        }

        // Update config state - find next available time (add just-scheduled time to avoid picking same slot)
        scheduledTimestamps.push(Math.floor(scheduledTime.getTime() / 1000));
        const nextAvailable = findNextAvailableTime(scheduleMinutesStr, scheduledTimestamps);
        const nextPostAt = nextAvailable.toISOString();
        await sql`
          UPDATE auto_post_config
          SET last_post_type = ${nextPostType},
              last_post_at = ${nowStr},
              next_post_at = ${nextPostAt},
              updated_at = ${nowStr}
          WHERE id = ${config.id}::uuid
        `;

        // Mark quote as used
        const usedByPages: string[] = unusedQuote.used_by_pages || [];
        if (!usedByPages.includes(config.page_id)) {
          usedByPages.push(config.page_id);
        }
        await sql`
          UPDATE quotes SET used_by_pages = ${usedByPages} WHERE id = ${unusedQuote.id}
        `;

        processed++;
        results.push({ page_id: config.page_id, status: 'success', post_type: nextPostType, post_id: facebookPostId });
        console.log(`[cron-auto-post] Successfully posted ${nextPostType} for page ${config.page_id}`);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[cron-auto-post] Error for page ${config.page_id}:`, errorMessage);

        // Calculate next retry time (add 5 minutes on failure)
        const retryTime = new Date(Date.now() + 5 * 60 * 1000).toISOString();
        await sql`
          UPDATE auto_post_config
          SET next_post_at = ${retryTime}, updated_at = ${nowStr}
          WHERE id = ${config.id}::uuid
        `;

        results.push({ page_id: config.page_id, status: 'failed', error: errorMessage });
      }
    }

    await sql.end();
    return res.status(200).json({ success: true, processed, results });

  } catch (error) {
    await sql.end();
    console.error('[cron-auto-post] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

// Helper functions
async function createTextPost(pageId: string, postToken: string, message: string, scheduledTime?: Date): Promise<string> {
  const isScheduled = scheduledTime && scheduledTime.getTime() > Date.now() + 10 * 60 * 1000;
  console.log(`[cron-auto-post] Creating ${isScheduled ? 'SCHEDULED' : 'immediate'} text post for page ${pageId}${isScheduled ? ` at ${scheduledTime.toISOString()}` : ''}`);

  const body: any = {
    message,
    access_token: postToken,
  };

  // Add scheduled_publish_time if scheduling (must be at least 10 mins in future)
  if (isScheduled) {
    body.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);
    body.published = false;
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/feed`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.id;
}

async function createImagePost(pageId: string, postToken: string, imageUrl: string, message: string, scheduledTime?: Date): Promise<string> {
  const isScheduled = scheduledTime && scheduledTime.getTime() > Date.now() + 10 * 60 * 1000;
  console.log(`[cron-auto-post] Creating ${isScheduled ? 'SCHEDULED' : 'immediate'} image post for page ${pageId}${isScheduled ? ` at ${scheduledTime.toISOString()}` : ''}`);

  const body: any = {
    url: imageUrl,
    caption: message,
    access_token: postToken,
  };

  // Add scheduled_publish_time if scheduling (must be at least 10 mins in future)
  if (isScheduled) {
    body.scheduled_publish_time = Math.floor(scheduledTime.getTime() / 1000);
    body.published = false;
  }

  const response = await fetch(
    `https://graph.facebook.com/v21.0/${pageId}/photos`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Facebook API error: ${response.status} - ${error}`);
  }

  const result = await response.json();
  return result.post_id || result.id;
}

async function generateAIImage(
  quoteText: string,
  customPrompt?: string,
  aspectRatio?: string,
  pageName?: string,
  aiModel?: string,
  aiResolution?: string
): Promise<string> {
  const model = aiModel || 'gemini-2.0-flash-exp';
  const resolution = aiResolution || '2K';
  console.log(`[cron-auto-post] Generating AI image - model: ${model}, resolution: ${resolution}, aspectRatio: ${aspectRatio}`);

  let textPrompt: string;
  const finalAspectRatio = aspectRatio || '1:1';

  // Resolution dimensions
  const resolutionDimensions: Record<string, Record<string, string>> = {
    '2K': { '1:1': '1024x1024', '2:3': '1024x1536', '3:2': '1536x1024', '16:9': '1920x1080', '9:16': '1080x1920' },
    '4K': { '1:1': '2048x2048', '2:3': '2048x3072', '3:2': '3072x2048', '16:9': '3840x2160', '9:16': '2160x3840' },
  };
  const dimensions = resolutionDimensions[resolution]?.[finalAspectRatio] || resolutionDimensions['2K'][finalAspectRatio] || '1024x1024';

  if (customPrompt && customPrompt.trim()) {
    textPrompt = customPrompt
      .replace(/\{\{QUOTE\}\}/g, quoteText)
      .replace(/\{\{PAGE_NAME\}\}/g, pageName || '');

    textPrompt += `\n\n**CRITICAL IMAGE DIMENSIONS:**
- **Aspect Ratio: ${finalAspectRatio}** → Generate image with ${dimensions} pixels
- สร้างแค่ 1 รูปเดียว ห้ามสร้าง grid, collage`;
  } else {
    textPrompt = `สร้างรูปภาพ 1 รูป สำหรับโพสต์ Facebook:
**ข้อความภาษาไทย:** "${quoteText}"
**สไตล์:** Quote/คำคม สำหรับ Social Media ไทย
**ขนาด:** ${dimensions} pixels`;
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
    const result = await sql`
      SELECT page_name FROM auto_post_config WHERE page_id = ${pageId} LIMIT 1
    `;
    return result[0]?.page_name || null;
  } catch {
    return null;
  }
}

