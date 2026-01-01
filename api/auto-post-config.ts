import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

// Get scheduled posts from Facebook API
async function getScheduledPostsFromFacebook(pageId: string, pageToken: string): Promise<number[]> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/scheduled_posts?fields=scheduled_publish_time&access_token=${pageToken}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((post: any) => parseInt(post.scheduled_publish_time));
  } catch {
    return [];
  }
}

// Find next available time slot
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pageId = req.query.pageId as string;
  
  if (!pageId) {
    return res.status(400).json({ error: 'Missing pageId parameter' });
  }

  if (!dbUrl) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Get auto-post config for specific page
    const configs = await sql`
      SELECT page_id, enabled, next_post_at, last_post_at, last_post_type, post_token
      FROM auto_post_config 
      WHERE page_id = ${pageId}
      LIMIT 1
    `;

    if (configs.length === 0) {
      await sql.end();
      return res.status(200).json({ 
        success: true, 
        config: null,
        message: 'No auto-post config found for this page'
      });
    }

    const config = configs[0];

    // If enabled and has token, refresh next_post_at by checking Facebook scheduled posts
    if (config.enabled && config.post_token) {
      try {
        // Get page settings
        const settingsResult = await sql`
          SELECT schedule_minutes FROM page_settings WHERE page_id = ${pageId} LIMIT 1
        `;
        const scheduleMinutesStr = settingsResult[0]?.schedule_minutes || '00, 15, 30, 45';

        // Get current scheduled posts from Facebook
        const scheduledTimestamps = await getScheduledPostsFromFacebook(pageId, config.post_token);
        
        // Calculate fresh next available time
        const nextAvailable = findNextAvailableTimeSlot(scheduleMinutesStr, scheduledTimestamps);
        const freshNextPostAt = nextAvailable.toISOString();

        // Update if different from stored value
        if (freshNextPostAt !== config.next_post_at) {
          await sql`
            UPDATE auto_post_config
            SET next_post_at = ${freshNextPostAt}, updated_at = ${new Date().toISOString()}
            WHERE page_id = ${pageId}
          `;
          config.next_post_at = freshNextPostAt;
          console.log(`[auto-post-config] Updated next_post_at for ${pageId}: ${freshNextPostAt}`);
        }
      } catch (error) {
        console.error(`[auto-post-config] Failed to refresh next_post_at for ${pageId}:`, error);
      }
    }

    await sql.end();
    return res.status(200).json({ 
      success: true, 
      config
    });

  } catch (error) {
    await sql.end();
    console.error('[auto-post-config] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
