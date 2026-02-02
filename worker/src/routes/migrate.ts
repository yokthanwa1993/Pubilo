import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// GET /api/migrate - Show migration status
app.get('/', async (c) => {
    try {
        const tables = ['page_settings', 'tokens', 'prompts', 'quotes', 'global_settings'];
        const counts: Record<string, number> = {};

        for (const table of tables) {
            try {
                const result = await c.env.DB.prepare(`SELECT COUNT(*) as count FROM ${table}`).first();
                counts[table] = (result as any)?.count || 0;
            } catch {
                counts[table] = -1; // Table doesn't exist
            }
        }

        return c.json({
            success: true,
            message: 'Migration status',
            counts,
        });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as migrateRouter };
