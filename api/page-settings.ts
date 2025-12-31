import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PageSettings {
  page_id: string;
  auto_schedule: boolean;
  schedule_minutes: string;
  updated_at?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Load settings for a page
  if (req.method === 'GET') {
    try {
      const { pageId } = req.query;

      if (!pageId || typeof pageId !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const { data, error } = await supabase
        .from('page_settings')
        .select('*')
        .eq('page_id', pageId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[page-settings] GET error:', error);
      }

      return res.status(200).json({
        success: true,
        settings: data || {
          page_id: pageId,
          auto_schedule: false,
          schedule_minutes: '00, 15, 30, 45',
        },
      });
    } catch (error) {
      console.error('[page-settings] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // POST - Save settings for a page
  if (req.method === 'POST') {
    try {
      const { pageId, autoSchedule, scheduleMinutes } = req.body;

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const autoScheduleBool = autoSchedule === true || autoSchedule === 'true';
      const mins = scheduleMinutes || '00, 15, 30, 45';

      const settings: PageSettings = {
        page_id: pageId,
        auto_schedule: autoScheduleBool,
        schedule_minutes: mins,
        updated_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from('page_settings')
        .upsert(settings, { onConflict: 'page_id' })
        .select()
        .single();

      if (error) {
        console.error('[page-settings] POST error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[page-settings] Saved:', data);

      return res.status(200).json({
        success: true,
        settings: data,
      });
    } catch (error) {
      console.error('[page-settings] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
