import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// GET /api/auto-post-logs - get post logs for a page
app.get('/', async (c) => {
    const pageId = c.req.query('pageId') || c.req.query('page_id');
    const limit = parseInt(c.req.query('limit') || '50');
    const type = c.req.query('type'); // 'post' or 'share'

    try {
        if (type === 'share') {
            // Get share logs
            const results = await c.env.DB.prepare(`
                SELECT * FROM share_queue 
                WHERE target_page_id = ? 
                ORDER BY created_at DESC LIMIT ?
            `).bind(pageId, limit).all();
            return c.json({ success: true, logs: results.results || [], type: 'share' });
        }

        // Default: get auto_post_logs
        let query = 'SELECT * FROM auto_post_logs';
        const params: any[] = [];

        if (pageId) {
            query += ' WHERE page_id = ?';
            params.push(pageId);
        }

        query += ' ORDER BY created_at DESC LIMIT ?';
        params.push(limit);

        const results = await c.env.DB.prepare(query).bind(...params).all();

        // Get share status for each log
        const logs = results.results || [];
        const postIds = logs.filter((l: any) => l.facebook_post_id).map((l: any) => l.facebook_post_id);

        let shareMap: Record<string, any> = {};
        if (postIds.length > 0) {
            for (const postId of postIds) {
                const shareData = await c.env.DB.prepare(`
                    SELECT status, shared_at, shared_post_id FROM share_queue WHERE facebook_post_id = ?
                `).bind(postId).first();
                if (shareData) {
                    shareMap[postId] = shareData;
                }
            }
        }

        const logsWithShare = logs.map((log: any) => ({
            ...log,
            share_status: shareMap[log.facebook_post_id]?.status || null,
            shared_at: shareMap[log.facebook_post_id]?.shared_at || null,
            shared_post_id: shareMap[log.facebook_post_id]?.shared_post_id || null
        }));

        return c.json({ success: true, logs: logsWithShare, type: 'post' });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// DELETE /api/auto-post-logs/:id
app.delete('/:id', async (c) => {
    const id = c.req.param('id');
    try {
        await c.env.DB.prepare('DELETE FROM auto_post_logs WHERE id = ?').bind(id).run();
        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as logsRouter };
