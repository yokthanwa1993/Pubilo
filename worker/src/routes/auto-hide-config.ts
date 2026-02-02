import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// GET /api/auto-hide-config?pageId=xxx
app.get('/', async (c) => {
    const pageId = c.req.query('pageId');
    if (!pageId) return c.json({ success: false, error: 'Missing pageId' }, 400);

    try {
        const result = await c.env.DB.prepare(`
            SELECT page_id, hide_types, hide_token FROM page_settings WHERE page_id = ?
        `).bind(pageId).first();

        if (result) {
            return c.json({
                success: true,
                config: {
                    enabled: !!result.hide_types,
                    hide_types: result.hide_types || 'shared_story,mobile_status_update,added_photos',
                    hide_token: result.hide_token || '',
                },
            });
        }

        return c.json({
            success: true,
            config: {
                enabled: false,
                hide_types: 'shared_story,mobile_status_update,added_photos',
                hide_token: '',
            },
        });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// POST /api/auto-hide-config
app.post('/', async (c) => {
    try {
        const { pageId, enabled, hideTypes, hideToken } = await c.req.json();
        if (!pageId) return c.json({ success: false, error: 'Missing pageId' }, 400);

        const now = new Date().toISOString();

        await c.env.DB.prepare(`
            INSERT INTO page_settings (page_id, hide_types, hide_token, updated_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(page_id) DO UPDATE SET
                hide_types = excluded.hide_types,
                hide_token = excluded.hide_token,
                updated_at = excluded.updated_at
        `).bind(pageId, enabled ? hideTypes : null, hideToken || null, now).run();

        return c.json({
            success: true,
            config: { enabled, hide_types: hideTypes, hide_token: hideToken },
        });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as autoHideConfigRouter };
