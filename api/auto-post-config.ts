import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

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
      SELECT page_id, enabled, next_post_at, last_post_at, last_post_type
      FROM auto_post_config 
      WHERE page_id = ${pageId}
      LIMIT 1
    `;

    await sql.end();

    if (configs.length === 0) {
      return res.status(200).json({ 
        success: true, 
        config: null,
        message: 'No enabled auto-post config found'
      });
    }

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
