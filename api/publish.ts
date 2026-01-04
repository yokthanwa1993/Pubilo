import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const API_VERSION = "v21.0";
const API_BASE = `https://graph.facebook.com/${API_VERSION}`;

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

// Get scheduled posts from Facebook API
async function getScheduledPostsFromFacebook(pageId: string, pageToken: string): Promise<number[]> {
  try {
    const response = await fetch(
      `${API_BASE}/${pageId}/scheduled_posts?fields=scheduled_publish_time&access_token=${pageToken}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((post: any) => parseInt(post.scheduled_publish_time));
  } catch {
    return [];
  }
}

// Find next available time slot (same logic as auto-post-config)
function findNextAvailableTimeSlot(scheduleMinutesStr: string, scheduledTimestamps: number[]): Date {
  const scheduledMinutes = scheduleMinutesStr
    .split(',')
    .map(m => parseInt(m.trim()))
    .filter(m => !isNaN(m) && m >= 0 && m < 60)
    .sort((a, b) => a - b);

  if (scheduledMinutes.length === 0) {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  const now = new Date();
  const minTime = new Date(now.getTime() + 10 * 60 * 1000);

  for (let hourOffset = 0; hourOffset < 24; hourOffset++) {
    for (const minute of scheduledMinutes) {
      const candidate = new Date(now);
      candidate.setUTCHours(now.getUTCHours() + hourOffset, minute, 0, 0);

      if (candidate.getTime() < minTime.getTime()) continue;

      const candidateTimestamp = Math.floor(candidate.getTime() / 1000);
      const isTaken = scheduledTimestamps.some(ts => Math.abs(ts - candidateTimestamp) < 120);

      if (!isTaken) {
        return candidate;
      }
    }
  }

  return new Date(Date.now() + 60 * 60 * 1000);
}

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const {
      imageUrl,
      linkUrl,
      linkName,
      caption,
      description,
      primaryText,
      accessToken,
      cookieData,
      pageId,
      adAccountId,
      scheduledTime,
      message,
      postType,
      scheduled
    } = req.body;

    // Handle text posts
    if (postType === 'text') {
      if (!message) {
        return res.status(400).json({ success: false, error: 'No message provided for text post' });
      }
      if (!pageId) {
        return res.status(400).json({ success: false, error: 'No page selected' });
      }
      if (!accessToken) {
        return res.status(400).json({ success: false, error: 'No Page Token provided' });
      }

      // Use the Page Token sent from frontend directly (NOT Ads Token)
      const pageToken = accessToken;

      console.log(`[publish] Text post - pageId: ${pageId}, token: ${pageToken.substring(0, 20)}...`);
      
      let fbBody: any = {
        message,
        access_token: pageToken,
      };

      // Schedule post
      if (scheduled) {
        // Use Auto Schedule time from page_settings
        let scheduleTime: Date;

        if (dbUrl) {
          const sql = postgres(dbUrl, { ssl: 'require' });
          try {
            // Get schedule_minutes from page_settings
            const settingsResult = await sql`
              SELECT schedule_minutes FROM page_settings WHERE page_id = ${pageId} LIMIT 1
            `;
            const scheduleMinutesStr = settingsResult[0]?.schedule_minutes || '00, 15, 30, 45';

            // Get current scheduled posts from Facebook to avoid conflicts
            const scheduledTimestamps = await getScheduledPostsFromFacebook(pageId, pageToken);

            // Find next available time slot
            scheduleTime = findNextAvailableTimeSlot(scheduleMinutesStr, scheduledTimestamps);

            console.log(`[publish] Using Auto Schedule time from page_settings: ${scheduleMinutesStr}`);
          } catch (dbError) {
            console.error(`[publish] DB error, fallback to 15min:`, dbError);
            scheduleTime = new Date(Date.now() + 15 * 60 * 1000);
          } finally {
            await sql.end();
          }
        } else {
          // Fallback if no database
          scheduleTime = new Date(Date.now() + 15 * 60 * 1000);
        }

        fbBody.scheduled_publish_time = Math.floor(scheduleTime.getTime() / 1000);
        fbBody.published = false;
        console.log(`[publish] Scheduling text post for: ${scheduleTime.toISOString()}`);
      }

      // Post to Facebook
      const fbResponse = await fetch(`${API_BASE}/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fbBody),
      });

      const fbResult = await fbResponse.json();
      console.log(`[publish] Facebook response:`, fbResult);

      if (fbResponse.ok && fbResult.id) {
        return res.status(200).json({
          success: true,
          postId: fbResult.id,
          scheduledTime: scheduled ? fbBody.scheduled_publish_time * 1000 : null
        });
      } else {
        return res.status(400).json({
          success: false,
          error: fbResult.error?.message || 'Facebook API error'
        });
      }
    }

    // Original image/link post logic
    if (!imageUrl) {
      return res.status(400).json({ success: false, error: 'No image provided' });
    }
    if (!linkUrl) {
      return res.status(400).json({ success: false, error: 'Missing linkUrl' });
    }
    if (!accessToken) {
      return res.status(400).json({ success: false, error: 'No access token' });
    }
    if (!pageId) {
      return res.status(400).json({ success: false, error: 'No page selected' });
    }

    // Use AD_ACCOUNT_ID from env, fallback to request body
    const finalAdAccountId = adAccountId || process.env.AD_ACCOUNT_ID;
    if (!finalAdAccountId) {
      return res.status(400).json({ success: false, error: 'No ad account configured' });
    }

    const formattedAdAccountId = finalAdAccountId.startsWith("act_") ? finalAdAccountId : `act_${finalAdAccountId}`;

    // Upload image if it's base64
    let finalImageUrl = imageUrl;
    if (imageUrl.startsWith('data:')) {
      console.log('[Pubilo] Uploading base64 image to freeimage...');
      finalImageUrl = await uploadToFreeImage(imageUrl);
      console.log('[Pubilo] Image uploaded to:', finalImageUrl);
    }

    // Step 1: Create ad creative
    const creativeId = await createAdCreative({
      imageUrl: finalImageUrl,
      linkUrl,
      linkName,
      caption: caption || 'Check it out!',
      description: description || '',
      primaryText: primaryText || '',
      pageId,
      adAccountId: formattedAdAccountId,
      accessToken,
      cookie: cookieData,
    });

    // Step 2: Trigger processing
    await triggerProcessing(creativeId, accessToken, cookieData);

    // Step 3: Get Page Access Token
    const pageAccessToken = await fetchPageAccessToken(accessToken, cookieData, pageId);

    // Step 4: Wait for post ID
    const postId = await waitForPostId(creativeId, accessToken, cookieData);

    // Step 5: Publish or return for scheduling
    if (scheduledTime) {
      // Return post ID for frontend to schedule via extension GraphQL
      return res.status(200).json({
        success: true,
        needsScheduling: true,
        postId,
        url: `https://www.facebook.com/${postId}`,
        scheduledTime,
      });
    } else {
      // Immediate publish
      await publishPost(postId, pageAccessToken, cookieData);
      return res.status(200).json({
        success: true,
        url: `https://www.facebook.com/${postId}`,
      });
    }
  } catch (error) {
    console.error('[Pubilo] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

// Helper functions
function getHeaders(cookie?: string) {
  const headers: Record<string, string> = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  };
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  return headers;
}

async function uploadToFreeImage(base64Data: string): Promise<string> {
  const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY;
  if (!FREEIMAGE_API_KEY) {
    throw new Error("FREEIMAGE_API_KEY not configured");
  }

  const base64Content = base64Data.replace(/^data:image\/\w+;base64,/, '');
  const formData = new FormData();
  formData.append('key', FREEIMAGE_API_KEY);
  formData.append('source', base64Content);
  formData.append('format', 'json');

  const response = await fetch('https://freeimage.host/api/1/upload', {
    method: 'POST',
    body: formData,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Failed to parse freeimage response: ${text.substring(0, 100)}`);
  }

  if (!data.image?.url) {
    throw new Error(`Failed to upload image: ${data.error?.message || 'Unknown error'}`);
  }

  return data.image.url;
}

async function createAdCreative(options: {
  imageUrl: string;
  linkUrl: string;
  linkName?: string;
  caption: string;
  description: string;
  primaryText?: string;
  pageId: string;
  adAccountId: string;
  accessToken: string;
  cookie?: string;
}): Promise<string> {
  const linkData: Record<string, any> = {
    picture: options.imageUrl,
    link: options.linkUrl,
    multi_share_optimized: true,
    multi_share_end_card: false,
    message: options.primaryText || options.description, // ใช้ primaryText เป็นแคปชั่นข้างบน
    call_to_action: { type: "SHOP_NOW" },
  };

  // Only include name if linkName is provided
  if (options.linkName) {
    linkData.name = options.linkName;
  }

  const payload = {
    object_story_spec: {
      link_data: linkData,
      page_id: options.pageId,
    },
  };

  const url = `${API_BASE}/${options.adAccountId}/adcreatives?access_token=${options.accessToken}&fields=effective_object_story_id`;

  console.log('[Pubilo] Creating ad creative with payload:', JSON.stringify(payload, null, 2));

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getHeaders(options.cookie),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  console.log('[Pubilo] Ad creative response:', JSON.stringify(data, null, 2));

  if (data.error) {
    const errorDetail = data.error.error_user_msg || data.error.error_subcode || data.error.code;
    throw new Error(`Failed to create ad creative: ${data.error.message} (${errorDetail})`);
  }

  return data.id;
}

async function triggerProcessing(creativeId: string, accessToken: string, cookie?: string): Promise<void> {
  const url = `${API_BASE}/${creativeId}?access_token=${accessToken}&fields=effective_object_story_id`;
  await fetch(url, { headers: getHeaders(cookie) });
}

async function fetchPageAccessToken(accessToken: string, cookie?: string, pageId?: string): Promise<string> {
  const url = `${API_BASE}/me/accounts?access_token=${accessToken}`;
  const response = await fetch(url, { headers: getHeaders(cookie) });
  const data = await response.json();

  if (data.error) {
    throw new Error(`Failed to fetch page token: ${data.error.message}`);
  }

  const page = pageId
    ? data.data?.find((p: any) => p.id === pageId)
    : data.data?.[0];

  if (!page?.access_token) {
    throw new Error("No page access token found");
  }

  return page.access_token;
}

async function waitForPostId(creativeId: string, accessToken: string, cookie?: string): Promise<string> {
  const maxAttempts = 10;
  const url = `${API_BASE}/${creativeId}?access_token=${accessToken}&fields=effective_object_story_id`;

  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const response = await fetch(url, { headers: getHeaders(cookie) });
      const data = await response.json();

      if (data.effective_object_story_id) {
        return data.effective_object_story_id;
      }
    } catch (err) {
      console.error(`Attempt ${i} failed:`, err);
    }

    if (i < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  throw new Error(`Post ID not available after ${maxAttempts} attempts`);
}

async function publishPost(postId: string, pageAccessToken: string, cookie?: string): Promise<void> {
  const url = `${API_BASE}/${postId}?access_token=${pageAccessToken}`;
  const body = { is_published: true };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...getHeaders(cookie),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await response.json();

  if (data.error) {
    throw new Error(`Failed to publish: ${data.error.message}`);
  }
}
