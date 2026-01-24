import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!dbUrl) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: dbUrl.includes('sslmode=disable') ? false : 'require' });

  try {
    // GET - Load config (token comes from page_settings)
    if (req.method === 'GET') {
      const { pageId } = req.query;
      if (!pageId) {
        await sql.end();
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const result = await sql`
        SELECT ahc.*, ps.post_token 
        FROM auto_hide_config ahc
        LEFT JOIN page_settings ps ON ahc.page_id = ps.page_id
        WHERE ahc.page_id = ${pageId as string} LIMIT 1
      `;

      await sql.end();
      return res.status(200).json({
        success: true,
        config: result[0] || { page_id: pageId, enabled: false }
      });
    }

    // POST - Save config (only enabled and hide_types, token is in page_settings)
    if (req.method === 'POST') {
      const { pageId, enabled, hideTypes } = req.body;
      if (!pageId) {
        await sql.end();
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const nowStr = new Date().toISOString();

      const result = await sql`
        INSERT INTO auto_hide_config (page_id, enabled, hide_types, updated_at)
        VALUES (${pageId}, ${enabled === true}, ${hideTypes || null}, ${nowStr})
        ON CONFLICT (page_id) DO UPDATE SET
          enabled = ${enabled === true},
          hide_types = COALESCE(${hideTypes || null}, auto_hide_config.hide_types),
          updated_at = ${nowStr}
        RETURNING *
      `;

      await sql.end();
      return res.status(200).json({ success: true, config: result[0] });
    }

    await sql.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    await sql.end();
    console.error('[auto-hide-config] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
