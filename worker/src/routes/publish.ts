import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

const FB_API = 'https://graph.facebook.com/v21.0';

// POST /api/publish - Publish to Facebook
app.post('/', async (c) => {
    try {
        const { pageId, pageToken, message, imageUrl, scheduledTime, link } = await c.req.json();

        if (!pageId || !pageToken) {
            return c.json({ success: false, error: 'Missing pageId or pageToken' }, 400);
        }

        let endpoint = `${FB_API}/${pageId}`;
        const params = new URLSearchParams({ access_token: pageToken });

        // Determine post type
        if (imageUrl) {
            endpoint += '/photos';
            params.append('url', imageUrl);
            if (message) params.append('caption', message);
        } else if (link) {
            endpoint += '/feed';
            params.append('link', link);
            if (message) params.append('message', message);
        } else {
            endpoint += '/feed';
            if (message) params.append('message', message);
        }

        // Schedule if time provided
        if (scheduledTime) {
            const timestamp = Math.floor(new Date(scheduledTime).getTime() / 1000);
            params.append('scheduled_publish_time', String(timestamp));
            params.append('published', 'false');
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        const data = await response.json() as any;

        if (data.error) {
            return c.json({ success: false, error: data.error.message }, 400);
        }

        return c.json({ success: true, postId: data.id || data.post_id });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as publishRouter };
