import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!dbUrl) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  // POST - Save auto-post config (now uses page_settings)
  if (req.method === 'POST') {
    const { pageId, enabled, postToken, postMode, colorBg, sharePageId, colorBgPresets, shareMode, shareScheduleMinutes, pageColor, pageName } = req.body;

    if (!pageId) {
      await sql.end();
      return res.status(400).json({ error: 'Missing pageId' });
    }

    try {
      const now = new Date().toISOString();

      // Build update object with only provided fields
      const updates: string[] = ['updated_at = $1'];
      const values: any[] = [now];
      let paramIndex = 2;

      if ('enabled' in req.body) {
        updates.push(`auto_schedule = $${paramIndex++}`);
        values.push(enabled === true || enabled === 'true');
      }
      if ('postMode' in req.body) {
        updates.push(`post_mode = $${paramIndex++}`);
        values.push(postMode ?? null);
      }
      if ('postToken' in req.body && postToken) {
        updates.push(`post_token = $${paramIndex++}`);
        values.push(postToken);
      }
      if ('colorBg' in req.body) {
        updates.push(`color_bg = $${paramIndex++}`);
        values.push(colorBg || false);
      }
      if ('sharePageId' in req.body) {
        updates.push(`share_page_id = $${paramIndex++}`);
        values.push(sharePageId || null);
      }
      if ('colorBgPresets' in req.body) {
        updates.push(`color_bg_presets = $${paramIndex++}`);
        values.push(colorBgPresets || null);
      }
      if ('shareMode' in req.body) {
        updates.push(`share_mode = $${paramIndex++}`);
        values.push(shareMode || 'both');
      }
      if ('shareScheduleMinutes' in req.body) {
        updates.push(`share_schedule_minutes = $${paramIndex++}`);
        values.push(shareScheduleMinutes || null);
      }
      if ('pageColor' in req.body) {
        updates.push(`page_color = $${paramIndex++}`);
        values.push(pageColor || '#f59e0b');
      }
      if ('pageName' in req.body) {
        updates.push(`page_name = $${paramIndex++}`);
        values.push(pageName || null);
      }

      // Use upsert to page_settings
      await sql`
        INSERT INTO page_settings (page_id, updated_at)
        VALUES (${pageId}, ${now})
        ON CONFLICT (page_id) DO NOTHING
      `;

      // Update the fields
      if (updates.length > 1) {
        const updateQuery = `UPDATE page_settings SET ${updates.join(', ')} WHERE page_id = $${paramIndex}`;
        values.push(pageId);
        await sql.unsafe(updateQuery, values);
      }

      // Get updated config (map to old format for compatibility)
      const configs = await sql`
        SELECT
          page_id,
          auto_schedule as enabled,
          NULL as next_post_at,
          NULL as last_post_at,
          last_post_type,
          post_token,
          post_mode,
          color_bg,
          share_page_id,
          color_bg_presets,
          share_mode,
          share_schedule_minutes,
          page_color,
          page_name
        FROM page_settings
        WHERE page_id = ${pageId}
        LIMIT 1
      `;

      await sql.end();
      return res.status(200).json({ success: true, config: configs[0] });

    } catch (error) {
      await sql.end();
      console.error('[auto-post-config] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // GET - Read auto-post config (now from page_settings)
  if (req.method !== 'GET') {
    await sql.end();
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const pageId = req.query.pageId as string;
  const targetPageId = req.query.targetPageId as string;

  // If targetPageId is provided, return all configs that share to this target
  if (targetPageId) {
    try {
      const configs = await sql`
        SELECT page_id, share_schedule_minutes, page_color, page_name
        FROM page_settings
        WHERE share_page_id = ${targetPageId}
      `;
      await sql.end();
      return res.status(200).json({ success: true, configs });
    } catch (err) {
      await sql.end();
      console.error('[auto-post-config] targetPageId error:', err);
      return res.status(500).json({ error: 'Database error' });
    }
  }

  if (!pageId) {
    await sql.end();
    return res.status(400).json({ error: 'Missing pageId parameter' });
  }

  try {
    // Get config from page_settings (map to old format for compatibility)
    const configs = await sql`
      SELECT
        page_id,
        auto_schedule as enabled,
        NULL as next_post_at,
        NULL as last_post_at,
        last_post_type,
        post_token,
        post_mode,
        color_bg,
        share_page_id,
        color_bg_presets,
        share_mode,
        share_schedule_minutes,
        page_color,
        page_name
      FROM page_settings
      WHERE page_id = ${pageId}
      LIMIT 1
    `;

    if (configs.length === 0) {
      await sql.end();
      return res.status(200).json({
        success: true,
        config: null,
        message: 'No config found for this page'
      });
    }

    await sql.end();
    return res.status(200).json({
      success: true,
      config: configs[0]
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
