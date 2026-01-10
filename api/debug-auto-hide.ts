import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { pageId } = req.query;
  if (!pageId || typeof pageId !== 'string') {
    return res.status(400).json({ error: 'Missing pageId' });
  }

  if (!dbUrl) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // Get config for this page
    const configs = await sql`
      SELECT page_id, enabled, post_token, hide_types FROM auto_hide_config WHERE page_id = ${pageId}
    `;

    if (!configs || configs.length === 0) {
      await sql.end();
      return res.status(404).json({ error: 'Config not found for this page' });
    }

    const config = configs[0];

    // Get already hidden posts
    const hiddenPosts = await sql`
      SELECT post_id, hidden_at FROM hidden_posts WHERE page_id = ${pageId} ORDER BY hidden_at DESC LIMIT 20
    `;

    // Get posts from Facebook
    let fbPosts: any[] = [];
    let fbError: string | null = null;

    if (config.post_token) {
      try {
        const url = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,status_type,message,created_time&limit=20&access_token=${config.post_token}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
          fbError = data.error.message;
        } else {
          fbPosts = data.data || [];
        }
      } catch (err) {
        fbError = err instanceof Error ? err.message : 'Unknown error';
      }
    }

    await sql.end();

    return res.status(200).json({
      success: true,
      config: {
        enabled: config.enabled,
        hide_types: config.hide_types,
        has_token: !!config.post_token
      },
      already_hidden: hiddenPosts,
      facebook_posts: fbPosts,
      facebook_error: fbError
    });

  } catch (err) {
    await sql.end();
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
