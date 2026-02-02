import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// Hide a post on Facebook
async function hidePost(postId: string, pageToken: string): Promise<boolean> {
    try {
        const response = await fetch(`https://graph.facebook.com/v21.0/${postId}?timeline_visibility=hidden&access_token=${pageToken}`, { method: 'POST' });
        const data = await response.json() as any;
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
        const response = await fetch(`https://graph.facebook.com/v21.0/${pageId}/posts?fields=id,status_type&limit=50&access_token=${pageToken}`);
        const data = await response.json() as any;

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

// Cron handler for auto-hide
app.get('/', async (c) => {
    try {
        // Get all pages with hide_types set (means auto-hide enabled)
        const configs = await c.env.DB.prepare(`
            SELECT page_id, hide_token, post_token, hide_types 
            FROM page_settings 
            WHERE hide_types IS NOT NULL AND hide_types != ''
        `).all<{ page_id: string; hide_token: string | null; post_token: string | null; hide_types: string }>();

        if (!configs.results?.length) {
            return c.json({ success: true, message: 'No pages with auto-hide enabled', processed: 0 });
        }

        console.log(`[auto-hide] Processing ${configs.results.length} pages`);

        let totalHidden = 0;
        const results: any[] = [];

        for (const config of configs.results) {
            const token = config.hide_token || config.post_token;

            if (!token) {
                results.push({ page_id: config.page_id, status: 'skipped', reason: 'no_token' });
                continue;
            }

            // Get posts already hidden
            const hiddenPosts = await c.env.DB.prepare(`SELECT post_id FROM hidden_posts WHERE page_id = ?`).bind(config.page_id).all<{ post_id: string }>();
            const hiddenPostIds = new Set(hiddenPosts.results?.map(p => p.post_id) || []);

            // Get recent posts from Facebook
            const hideTypes = config.hide_types.split(',').map(t => t.trim());
            const recentPosts = await getRecentPosts(config.page_id, token, hideTypes);

            let hiddenCount = 0;
            for (const postId of recentPosts) {
                if (hiddenPostIds.has(postId)) continue;

                const success = await hidePost(postId, token);
                if (success) {
                    await c.env.DB.prepare(`INSERT OR IGNORE INTO hidden_posts (page_id, post_id, hidden_at) VALUES (?, ?, ?)`)
                        .bind(config.page_id, postId, new Date().toISOString()).run();
                    hiddenCount++;
                    totalHidden++;
                }
            }

            results.push({ page_id: config.page_id, status: 'success', hidden: hiddenCount });
            console.log(`[auto-hide] Page ${config.page_id}: hidden ${hiddenCount} posts`);
        }

        return c.json({ success: true, processed: configs.results.length, totalHidden, results });

    } catch (err) {
        console.error('[auto-hide] Error:', err);
        return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
});

export { app as autoHideRouter };
