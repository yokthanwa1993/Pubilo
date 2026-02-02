import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// GET /api/prompts
app.get('/', async (c) => {
    try {
        const results = await c.env.DB.prepare(`
            SELECT * FROM prompts ORDER BY created_at DESC
        `).all();
        return c.json({ success: true, prompts: results.results || [] });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// POST /api/prompts
app.post('/', async (c) => {
    try {
        const { id, name, prompt, category } = await c.req.json();
        if (!name || !prompt) return c.json({ success: false, error: 'Missing name or prompt' }, 400);

        const now = new Date().toISOString();
        const promptId = id || crypto.randomUUID();

        await c.env.DB.prepare(`
            INSERT INTO prompts (id, name, prompt, category, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                name = excluded.name,
                prompt = excluded.prompt,
                category = excluded.category,
                updated_at = excluded.updated_at
        `).bind(promptId, name, prompt, category || 'general', now, now).run();

        return c.json({ success: true, id: promptId });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// DELETE /api/prompts?id=xxx
app.delete('/', async (c) => {
    const id = c.req.query('id');
    if (!id) return c.json({ success: false, error: 'Missing id' }, 400);

    try {
        await c.env.DB.prepare(`DELETE FROM prompts WHERE id = ?`).bind(id).run();
        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as promptsRouter };
