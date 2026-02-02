import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// Check pending shares status
app.get('/', async (c) => {
    try {
        const now = new Date();
        const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const currentMinute = thaiNow.getUTCMinutes();
        const currentHour = thaiNow.getUTCHours();

        const pendingShares = await c.env.DB.prepare(`
            SELECT sq.*, ps.share_schedule_minutes, ps.page_name as source_page_name
            FROM share_queue sq
            LEFT JOIN page_settings ps ON sq.source_page_id = ps.page_id
            WHERE sq.status = 'pending'
            ORDER BY sq.created_at ASC
        `).all();

        return c.json({
            success: true,
            currentTime: `${currentHour}:${currentMinute.toString().padStart(2, '0')}`,
            pendingCount: pendingShares.results?.length || 0,
            pendingShares: pendingShares.results || []
        });
    } catch (err) {
        return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
});

export { app as checkPendingSharesRouter };
