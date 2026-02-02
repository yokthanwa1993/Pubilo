import { Hono } from 'hono';

const app = new Hono();

// Update scheduled post time via Facebook API
app.post('/', async (c) => {
    try {
        const { postId, pageToken, scheduledTime } = await c.req.json();

        if (!postId) return c.json({ success: false, error: 'Missing postId' }, 400);
        if (!pageToken) return c.json({ success: false, error: 'Missing pageToken' }, 400);
        if (!scheduledTime) return c.json({ success: false, error: 'Missing scheduledTime' }, 400);

        const response = await fetch(`https://graph.facebook.com/v21.0/${postId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ access_token: pageToken, scheduled_publish_time: scheduledTime })
        });
        const data = await response.json() as any;

        if (data.error) {
            return c.json({ success: false, error: data.error.message || 'Facebook API error' });
        }

        return c.json({ success: true });
    } catch (err) {
        return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
});

export { app as updatePostTimeRouter };
