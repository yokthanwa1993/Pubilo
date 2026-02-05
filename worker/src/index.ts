import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { pageSettingsRouter } from './routes/page-settings';
import { pagesRouter } from './routes/pages';
import { tokensRouter } from './routes/tokens';
import { promptsRouter } from './routes/prompts';
import { quotesRouter } from './routes/quotes';
import { globalSettingsRouter } from './routes/global-settings';
import { generateRouter } from './routes/generate';
import { publishRouter } from './routes/publish';
import { scheduledPostsRouter } from './routes/scheduled-posts';
import { deletePostRouter } from './routes/delete-post';
import { earningsRouter } from './routes/earnings';
import { autoPostConfigRouter } from './routes/auto-post-config';
import { autoHideConfigRouter } from './routes/auto-hide-config';
import { uploadImageRouter } from './routes/upload-image';
import { logsRouter } from './routes/logs';
import { migrateRouter } from './routes/migrate';
// Cron routes
import { cronAutoPostRouter } from './routes/cron-auto-post';
import { cronEarningsRouter } from './routes/cron-earnings';
import { autoHideRouter } from './routes/auto-hide';
// Additional routes
import { lineWebhookRouter } from './routes/line-webhook';
import { checkPendingSharesRouter } from './routes/check-pending-shares';
import { checkRiskyQuotesRouter } from './routes/check-risky-quotes';
import { textPostRouter } from './routes/text-post';
import { updatePostTimeRouter } from './routes/update-post-time';
import { generateNewsRouter } from './routes/generate-news';


export interface Env {
    DB: D1Database;
    IMAGES: R2Bucket;
    GEMINI_API_KEY: string;
    FREEIMAGE_API_KEY: string;
    LINE_CHANNEL_ACCESS_TOKEN?: string;
    LINE_CHANNEL_SECRET?: string;
    LINE_USER_ID?: string;
}

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
}));

// Health check
app.get('/', (c) => c.json({
    success: true,
    message: 'Pubilo API v5.3 - Cloudflare Workers',
    timestamp: new Date().toISOString(),
}));

app.get('/health', async (c) => {
    try {
        await c.env.DB.prepare('SELECT 1').run();
        return c.json({ success: true, database: 'connected' });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// Core API Routes
app.route('/api/pages', pagesRouter);
app.route('/api/page-settings', pageSettingsRouter);
app.route('/api/tokens', tokensRouter);
app.route('/api/prompts', promptsRouter);
app.route('/api/quotes', quotesRouter);
app.route('/api/global-settings', globalSettingsRouter);
app.route('/api/generate', generateRouter);
app.route('/api/publish', publishRouter);
app.route('/api/scheduled-posts', scheduledPostsRouter);
app.route('/api/delete-post', deletePostRouter);
app.route('/api/earnings', earningsRouter);
app.route('/api/auto-post-config', autoPostConfigRouter);
app.route('/api/auto-hide-config', autoHideConfigRouter);
app.route('/api/upload-image', uploadImageRouter);
app.route('/api/auto-post-logs', logsRouter);
app.route('/api/view-logs', logsRouter);
app.route('/api/logs', logsRouter);
app.route('/api/migrate', migrateRouter);

// Additional API Routes
app.route('/api/text-post', textPostRouter);
app.route('/api/update-post-time', updatePostTimeRouter);
app.route('/api/generate-news', generateNewsRouter);
app.route('/api/check-pending-shares', checkPendingSharesRouter);
app.route('/api/check-risky-quotes', checkRiskyQuotesRouter);
app.route('/api/line-webhook', lineWebhookRouter);

// Cron Routes
app.route('/api/cron/auto-post', cronAutoPostRouter);
app.route('/api/cron/auto-hide', autoHideRouter);
app.route('/api/cron/earnings', cronEarningsRouter);



// Scheduled handler for Cloudflare Cron Triggers
export default {
    fetch: app.fetch,
    async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
        const triggerTime = new Date(event.scheduledTime);
        const utcHour = triggerTime.getUTCHours();
        console.log('[scheduled] Cron trigger fired at', triggerTime.toISOString(), 'UTC hour:', utcHour);

        // 17:00 UTC = 00:00 Thailand - Fetch earnings only (no notification)
        if (utcHour === 17) {
            console.log('[scheduled] 00:00 TH - Fetching earnings (no notify)');
            try {
                const earningsReq = new Request('https://internal/api/cron/earnings?notify=false');
                const earningsRes = await app.fetch(earningsReq, env, ctx);
                const earningsData = await earningsRes.json();
                console.log('[scheduled] earnings fetch result:', earningsData);
            } catch (err) {
                console.error('[scheduled] earnings fetch error:', err);
            }
        }

        // 09:00 UTC = 16:00 Thailand - Fetch earnings and send notification
        if (utcHour === 9) {
            console.log('[scheduled] 16:00 TH - Fetching earnings WITH notification');
            try {
                const earningsReq = new Request('https://internal/api/cron/earnings?notify=true');
                const earningsRes = await app.fetch(earningsReq, env, ctx);
                const earningsData = await earningsRes.json();
                console.log('[scheduled] earnings notify result:', earningsData);
            } catch (err) {
                console.error('[scheduled] earnings notify error:', err);
            }
        }

        // Auto-post and auto-hide still run on their own schedule if needed
        // (Currently disabled since we removed the every-minute cron)
    },
};
