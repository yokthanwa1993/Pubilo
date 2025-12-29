import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getPageSettings, upsertPageSettings } from '../src/lib/db';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  // GET - Load settings for a page
  if (req.method === 'GET') {
    try {
      const { pageId } = req.query;

      if (!pageId || typeof pageId !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const settings = await getPageSettings(pageId);

      return res.status(200).json({
        success: true,
        settings: settings || {
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

      const result = await upsertPageSettings(
        pageId,
        autoSchedule === true || autoSchedule === 'true',
        scheduleMinutes || '00, 15, 30, 45'
      );

      console.log('[page-settings] Saved:', { pageId, autoSchedule, scheduleMinutes });

      return res.status(200).json({
        success: true,
        settings: result[0],
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
