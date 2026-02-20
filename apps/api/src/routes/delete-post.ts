import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

const FB_API = 'https://graph.facebook.com/v21.0';

// POST /api/delete-post
app.post('/', async (c) => {
    try {
        const { postId, pageToken } = await c.req.json();

        if (!postId || !pageToken) {
            return c.json({ success: false, error: 'Missing postId or pageToken' }, 400);
        }

        const response = await fetch(`${FB_API}/${postId}?access_token=${pageToken}`, {
            method: 'DELETE',
        });

        const data = await response.json() as any;

        if (data.error) {
            return c.json({ success: false, error: data.error.message }, 400);
        }

        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as deletePostRouter };
