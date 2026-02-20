import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

const FB_API = 'https://graph.facebook.com/v21.0';

// GET /api/scheduled-posts?pageId=xxx&pageToken=xxx
app.get('/', async (c) => {
    const pageId = c.req.query('pageId');
    const pageToken = c.req.query('pageToken');

    if (!pageId || !pageToken) {
        return c.json({ success: false, error: 'Missing pageId or pageToken' }, 400);
    }

    try {
        const fields = 'id,message,scheduled_publish_time,created_time,status_type,full_picture,attachments{media,subattachments}';
        const url = `${FB_API}/${pageId}/scheduled_posts?access_token=${pageToken}&fields=${fields}`;

        const response = await fetch(url);
        const data = await response.json() as any;

        if (data.error) {
            return c.json({ success: false, error: data.error.message }, 400);
        }

        const posts = (data.data || []).map((post: any) => ({
            id: post.id,
            message: post.message || '',
            scheduled_publish_time: post.scheduled_publish_time,
            created_time: post.created_time,
            type: post.status_type || 'unknown',
            image_url: post.full_picture || post.attachments?.data?.[0]?.media?.image?.src,
        }));

        return c.json({ success: true, posts });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as scheduledPostsRouter };
