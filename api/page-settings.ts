import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  const sql = neon(process.env.DATABASE_URL!);

  // GET - Load settings for a page
  if (req.method === 'GET') {
    try {
      const { pageId } = req.query;

      if (!pageId || typeof pageId !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const result = await sql`SELECT * FROM page_settings WHERE page_id = ${pageId} LIMIT 1`;
      const settings = result[0] || null;

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

      const autoScheduleBool = autoSchedule === true || autoSchedule === 'true';
      const mins = scheduleMinutes || '00, 15, 30, 45';

      const result = await sql`
        INSERT INTO page_settings (page_id, auto_schedule, schedule_minutes, updated_at)
        VALUES (${pageId}, ${autoScheduleBool}, ${mins}, NOW())
        ON CONFLICT (page_id) DO UPDATE SET
          auto_schedule = EXCLUDED.auto_schedule,
          schedule_minutes = EXCLUDED.schedule_minutes,
          updated_at = NOW()
        RETURNING *
      `;

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
