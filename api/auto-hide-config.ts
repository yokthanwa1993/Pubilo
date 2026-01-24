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
    // GET - Load config
    if (req.method === 'GET') {
      const { pageId } = req.query;
      if (!pageId) {
        await sql.end();
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const result = await sql`
        SELECT * FROM auto_hide_config WHERE page_id = ${pageId as string} LIMIT 1
      `;

      await sql.end();
      return res.status(200).json({
        success: true,
        config: result[0] || { page_id: pageId, enabled: false }
      });
    }

    // POST - Save config
    if (req.method === 'POST') {
      const { pageId, enabled, postToken, customToken, hideTypes } = req.body;
      if (!pageId) {
        await sql.end();
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const nowStr = new Date().toISOString();

      // Ensure custom_token column exists (migration)
      try {
        await sql`ALTER TABLE auto_hide_config ADD COLUMN IF NOT EXISTS custom_token TEXT`;
      } catch (e) {
        // Column might already exist, ignore error
      }

      const result = await sql`
        INSERT INTO auto_hide_config (page_id, enabled, post_token, custom_token, hide_types, updated_at)
        VALUES (${pageId}, ${enabled === true}, ${postToken || null}, ${customToken || null}, ${hideTypes || null}, ${nowStr})
        ON CONFLICT (page_id) DO UPDATE SET
          enabled = ${enabled === true},
          post_token = COALESCE(${postToken || null}, auto_hide_config.post_token),
          custom_token = ${customToken || null},
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
