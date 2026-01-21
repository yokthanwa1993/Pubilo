import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

interface AutoHideConfig {
  page_id: string;
  enabled: boolean;
  post_token: string | null;
  hide_types: string | null;
}

// Hide a post on Facebook
async function hidePost(postId: string, pageToken: string): Promise<boolean> {
  try {
    const url = `https://graph.facebook.com/v21.0/${postId}?timeline_visibility=hidden&access_token=${pageToken}`;
    const response = await fetch(url, { method: 'POST' });
    const data = await response.json();
    console.log(`[auto-hide] Hide post ${postId}:`, data);
    return data.success === true;
  } catch (err) {
    console.error(`[auto-hide] Error hiding post ${postId}:`, err);
    return false;
  }
}

// Get recent posts from a page
async function getRecentPosts(pageId: string, pageToken: string, hideTypes: string[]): Promise<string[]> {
  const postIds: string[] = [];
  try {
    const url = `https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,status_type&limit=50&access_token=${pageToken}`;
    const response = await fetch(url);
    const data = await response.json();
    
    for (const post of (data.data || [])) {
      if (hideTypes.includes(post.status_type)) {
        postIds.push(post.id);
      }
    }
  } catch (err) {
    console.error(`[auto-hide] Error fetching posts for page ${pageId}:`, err);
  }
  return postIds;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Verify cron secret
  const authHeader = req.headers['authorization'];
  const isTest = authHeader === 'Bearer test';
  const isValidCron = authHeader === `Bearer ${process.env.CRON_SECRET}`;

  if (process.env.CRON_SECRET && !isValidCron && !isTest) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!dbUrl) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: dbUrl.includes('sslmode=disable') ? false : 'require' });

  try {
    // Get all pages with auto-hide enabled
    const configs = await sql<AutoHideConfig[]>`
      SELECT page_id, enabled, post_token, hide_types FROM auto_hide_config WHERE enabled = true
    `;

    if (!configs || configs.length === 0) {
      await sql.end();
      return res.status(200).json({ success: true, message: 'No pages with auto-hide enabled', processed: 0 });
    }

    console.log(`[auto-hide] Processing ${configs.length} pages`);

    let totalHidden = 0;
    const results: any[] = [];

    for (const config of configs) {
      if (!config.post_token) {
        results.push({ page_id: config.page_id, status: 'skipped', reason: 'no_token' });
        continue;
      }

      // Get posts already hidden (from our tracking table)
      const hiddenPosts = await sql`
        SELECT post_id FROM hidden_posts WHERE page_id = ${config.page_id}
      `;
      const hiddenPostIds = new Set(hiddenPosts.map(p => p.post_id));

      // Get recent posts from Facebook
      const hideTypes = (config.hide_types || 'shared_story,mobile_status_update,added_photos').split(',');
      const recentPosts = await getRecentPosts(config.page_id, config.post_token, hideTypes);
      
      let hiddenCount = 0;
      for (const postId of recentPosts) {
        // Skip if already hidden
        if (hiddenPostIds.has(postId)) continue;

        // Hide the post
        const success = await hidePost(postId, config.post_token);
        if (success) {
          // Track that we hid this post
          await sql`
            INSERT INTO hidden_posts (page_id, post_id, hidden_at)
            VALUES (${config.page_id}, ${postId}, NOW())
            ON CONFLICT (post_id) DO NOTHING
          `;
          hiddenCount++;
          totalHidden++;
        }
      }

      results.push({ page_id: config.page_id, status: 'success', hidden: hiddenCount });
      console.log(`[auto-hide] Page ${config.page_id}: hidden ${hiddenCount} posts`);
    }

    await sql.end();
    return res.status(200).json({ success: true, processed: configs.length, totalHidden, results });

  } catch (err) {
    await sql.end();
    console.error('[auto-hide] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : 'Unknown error' });
  }
}
