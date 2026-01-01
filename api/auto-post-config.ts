import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AutoPostConfig {
  id: string;
  page_id: string;
  enabled: boolean;
  interval_minutes: number;
  last_post_type: 'text' | 'image' | null;
  last_post_at: string | null;
  next_post_at: string | null;
  post_token: string | null;
  created_at: string;
  updated_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Fetch config for a page
  if (req.method === 'GET') {
    try {
      const pageId = req.query.pageId as string;
      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const { data, error } = await supabase
        .from('auto_post_config')
        .select('*')
        .eq('page_id', pageId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      // Return default config if none exists
      if (!data) {
        return res.status(200).json({
          success: true,
          config: {
            page_id: pageId,
            enabled: false,
            interval_minutes: 60,
            last_post_type: null,
            last_post_at: null,
            next_post_at: null,
            post_token: null,
          }
        });
      }

      return res.status(200).json({ success: true, config: data });
    } catch (error) {
      console.error('[auto-post-config] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // POST - Create or update config
  if (req.method === 'POST') {
    try {
      const { pageId, enabled, intervalMinutes, postToken, nextPostAt: customNextPostAt } = req.body;

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      // Use custom nextPostAt if provided, otherwise calculate from schedule
      let nextPostAt = customNextPostAt || null;
      if (enabled && !nextPostAt && postToken) {
        // Get schedule_minutes from page_settings
        const { data: settings } = await supabase
          .from('page_settings')
          .select('schedule_minutes')
          .eq('page_id', pageId)
          .single();

        const scheduleMinutesStr = settings?.schedule_minutes || '00, 15, 30, 45';

        // Get scheduled posts from Facebook to find available slot
        const scheduledTimestamps = await getScheduledPosts(pageId, postToken);
        nextPostAt = findNextAvailableTime(scheduleMinutesStr, scheduledTimestamps).toISOString();
      }

      const updateData: any = {
        page_id: pageId,
        enabled: enabled ?? false,
        interval_minutes: intervalMinutes || 60,
        next_post_at: nextPostAt,
        updated_at: new Date().toISOString(),
      };

      // Only update post_token if provided
      if (postToken !== undefined) {
        updateData.post_token = postToken;
      }

      const { data, error } = await supabase
        .from('auto_post_config')
        .upsert(updateData, { onConflict: 'page_id' })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ success: true, config: data });
    } catch (error) {
      console.error('[auto-post-config] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// Get scheduled posts from Facebook to check which time slots are taken
async function getScheduledPosts(pageId: string, pageToken: string): Promise<number[]> {
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
  const minTime = new Date(now.getTime() + 11 * 60 * 1000); // Facebook requires 10+ minutes

  for (let hourOffset = 0; hourOffset < 24; hourOffset++) {
    for (const minute of scheduledMinutes) {
      const candidate = new Date(now);
      candidate.setUTCHours(now.getUTCHours() + hourOffset, minute, 0, 0);

      if (candidate.getTime() < minTime.getTime()) continue;

      const candidateTimestamp = Math.floor(candidate.getTime() / 1000);
      const isTaken = scheduledTimestamps.some(ts => Math.abs(ts - candidateTimestamp) < 60);

      if (!isTaken) {
        return candidate;
      }
    }
  }

  return new Date(Date.now() + 60 * 60 * 1000);
}
