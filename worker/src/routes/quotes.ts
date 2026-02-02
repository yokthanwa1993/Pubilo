import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// GET /api/quotes?random=true&limit=1&used=false&pageId=xxx
app.get('/', async (c) => {
    const random = c.req.query('random');
    const limit = parseInt(c.req.query('limit') || '10');
    const used = c.req.query('used'); // 'true' or 'false'
    const pageId = c.req.query('pageId');
    const countOnly = c.req.query('countOnly');

    try {
        // Get counts first
        const unusedCount = await c.env.DB.prepare(`
            SELECT COUNT(*) as count FROM quotes 
            WHERE used_by_pages IS NULL OR used_by_pages = '[]' OR used_by_pages = ''
        `).first<{ count: number }>();

        const usedCount = await c.env.DB.prepare(`
            SELECT COUNT(*) as count FROM quotes 
            WHERE used_by_pages IS NOT NULL AND used_by_pages != '[]' AND used_by_pages != ''
        `).first<{ count: number }>();

        const totalCount = (unusedCount?.count || 0) + (usedCount?.count || 0);

        if (countOnly === 'true') {
            return c.json({
                success: true,
                total: totalCount,
                unusedCount: unusedCount?.count || 0,
                usedCount: usedCount?.count || 0
            });
        }

        // Build query
        let query = 'SELECT * FROM quotes';
        const conditions: string[] = [];
        const params: any[] = [];

        // Get filter param (frontend sends filter=unused or filter=used)
        const filter = c.req.query('filter');

        // Filter by used status - support both 'used' param and 'filter' param
        if (used === 'false' || filter === 'unused') {
            conditions.push("(used_by_pages IS NULL OR used_by_pages = '[]' OR used_by_pages = '')");
        } else if (used === 'true' || filter === 'used') {
            conditions.push("(used_by_pages IS NOT NULL AND used_by_pages != '[]' AND used_by_pages != '')");
        }

        // Filter by pageId not used
        if (pageId) {
            conditions.push(`(used_by_pages IS NULL OR used_by_pages NOT LIKE '%"${pageId}"%')`);
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        if (random === 'true') {
            query += ' ORDER BY RANDOM()';
        } else {
            query += ' ORDER BY created_at DESC';
        }

        query += ` LIMIT ?`;
        params.push(limit);

        const results = await c.env.DB.prepare(query).bind(...params).all();

        return c.json({
            success: true,
            quotes: results.results || [],
            total: totalCount,
            unusedCount: unusedCount?.count || 0,
            usedCount: usedCount?.count || 0
        });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// POST /api/quotes - add new quote
app.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const content = body.content || body.quote_text;
        if (!content) return c.json({ success: false, error: 'Missing content' }, 400);

        await c.env.DB.prepare(`
            INSERT INTO quotes (quote_text, created_at) VALUES (?, ?)
        `).bind(content, new Date().toISOString()).run();

        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// DELETE /api/quotes/:id
app.delete('/:id', async (c) => {
    try {
        const id = c.req.param('id');
        await c.env.DB.prepare(`DELETE FROM quotes WHERE id = ?`).bind(id).run();
        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// PUT /api/quotes/:id - mark as used
app.put('/:id', async (c) => {
    try {
        const id = c.req.param('id');
        const { used_by_pages } = await c.req.json();

        await c.env.DB.prepare(`UPDATE quotes SET used_by_pages = ? WHERE id = ?`)
            .bind(JSON.stringify(used_by_pages), id).run();

        return c.json({ success: true });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as quotesRouter };
