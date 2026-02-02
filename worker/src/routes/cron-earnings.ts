import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// Cron endpoint for fetching earnings from Facebook
app.get('/', async (c) => {
    const shouldNotify = c.req.query('notify') !== 'false';

    try {
        const today = new Date().toISOString().split('T')[0];

        // Get pages with post_token
        const pages = await c.env.DB.prepare(`
            SELECT page_id, page_name, post_token, page_color 
            FROM page_settings 
            WHERE auto_schedule = 1 AND post_token IS NOT NULL
        `).all<{ page_id: string; page_name: string; post_token: string; page_color: string }>();

        if (!pages.results?.length) {
            return c.json({ success: true, message: 'No pages with auto_schedule enabled', count: 0 });
        }

        const results: any[] = [];

        for (const page of pages.results) {
            try {
                const fbUrl = `https://graph.facebook.com/v21.0/${page.page_id}/insights?metric=monetization_approximate_earnings&access_token=${page.post_token}`;
                const fbResponse = await fetch(fbUrl);
                const fbData = await fbResponse.json() as any;

                if (fbData.error) {
                    results.push({ pageId: page.page_id, pageName: page.page_name, error: fbData.error.message });
                    continue;
                }

                const dailyData = fbData.data?.find((d: any) => d.period === 'day');
                const weeklyData = fbData.data?.find((d: any) => d.period === 'week');
                const monthlyData = fbData.data?.find((d: any) => d.period === 'days_28');

                const latestDaily = dailyData?.values?.[dailyData.values.length - 1];
                const dailyEarnings = latestDaily?.value || 0;
                const dailyDate = latestDaily?.end_time?.split('T')[0] || today;
                const weeklyEarnings = weeklyData?.values?.[weeklyData.values.length - 1]?.value || 0;
                const monthlyEarnings = monthlyData?.values?.[monthlyData.values.length - 1]?.value || 0;

                // Upsert earnings
                await c.env.DB.prepare(`
                    INSERT INTO earnings_history (page_id, page_name, date, daily_earnings, weekly_earnings, monthly_earnings)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(page_id, date) DO UPDATE SET 
                        daily_earnings = excluded.daily_earnings,
                        weekly_earnings = excluded.weekly_earnings,
                        monthly_earnings = excluded.monthly_earnings
                `).bind(page.page_id, page.page_name, dailyDate, dailyEarnings, weeklyEarnings, monthlyEarnings).run();

                results.push({
                    pageId: page.page_id,
                    pageName: page.page_name,
                    pageColor: page.page_color || '#666666',
                    daily: dailyEarnings,
                    weekly: weeklyEarnings,
                    monthly: monthlyEarnings,
                    saved: true
                });
            } catch (err) {
                results.push({ pageId: page.page_id, error: err instanceof Error ? err.message : String(err) });
            }
        }

        // TODO: Send LINE notification if shouldNotify

        return c.json({ success: true, date: today, processed: pages.results.length, results });
    } catch (err) {
        return c.json({ success: false, error: err instanceof Error ? err.message : String(err) }, 500);
    }
});

export { app as cronEarningsRouter };
