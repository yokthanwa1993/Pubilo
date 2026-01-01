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
      if (enabled && !nextPostAt) {
        // Get schedule_minutes from page_settings
        const { data: settings } = await supabase
          .from('page_settings')
          .select('schedule_minutes')
          .eq('page_id', pageId)
          .single();

        const scheduleMinutesStr = settings?.schedule_minutes || '00, 15, 30, 45';
        nextPostAt = getNextScheduledTime(scheduleMinutesStr).toISOString();
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

// Find next scheduled time based on minute schedule (e.g., "00, 15, 30, 45")
function getNextScheduledTime(scheduleMinutesStr: string): Date {
  const scheduledMinutes = scheduleMinutesStr
    .split(',')
    .map(m => parseInt(m.trim()))
    .filter(m => !isNaN(m) && m >= 0 && m < 60)
    .sort((a, b) => a - b);

  if (scheduledMinutes.length === 0) {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  const now = new Date();
  const currentMinute = now.getMinutes();
  const currentHour = now.getHours();

  let nextMinute = scheduledMinutes.find(m => m > currentMinute);
  let nextHour = currentHour;
  let addDays = 0;

  if (nextMinute === undefined) {
    nextMinute = scheduledMinutes[0];
    nextHour = currentHour + 1;
    if (nextHour >= 24) {
      nextHour = 0;
      addDays = 1;
    }
  }

  const nextTime = new Date(now);
  nextTime.setHours(nextHour, nextMinute, 0, 0);

  if (addDays > 0) {
    nextTime.setDate(nextTime.getDate() + addDays);
  }

  return nextTime;
}
