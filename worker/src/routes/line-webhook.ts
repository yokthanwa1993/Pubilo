import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// LINE Webhook handler
app.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const events = body.events || [];
        const LINE_TOKEN = c.env.LINE_CHANNEL_ACCESS_TOKEN;

        for (const event of events) {
            if (event.type !== 'message') continue;

            // Handle stickers
            if (event.message.type === 'sticker') {
                if (LINE_TOKEN) {
                    await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                        body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: '⚠️ ไม่รองรับ Sticker กรุณาส่งเป็นข้อความ' }] })
                    });
                }
                continue;
            }

            if (event.message.type !== 'text') continue;

            let text = (event.message.text || '').trim();
            if (!text) continue;

            // Command: /id
            if (text.toLowerCase() === 'id' || text.toLowerCase() === '/id') {
                const userId = event.source?.userId || 'Unknown';
                if (LINE_TOKEN) {
                    await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                        body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: `🆔 Your LINE User ID:\n${userId}` }] })
                    });
                }
                continue;
            }

            // Command: /earnings
            if (text.toLowerCase() === 'earnings' || text.toLowerCase() === '/earnings') {
                // Trigger earnings fetch
                try {
                    const earningsResponse = await fetch('https://api.pubilo.com/api/cron/earnings');
                    const data = await earningsResponse.json() as any;

                    const summary = data.results?.filter((r: any) => r.saved)
                        .map((r: any) => `${r.pageName}: $${(r.daily || 0).toFixed(2)}`)
                        .join('\n') || 'No earnings data';

                    if (LINE_TOKEN) {
                        await fetch('https://api.line.me/v2/bot/message/reply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                            body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: `💰 Earnings Today:\n${summary}` }] })
                        });
                    }
                } catch (err) {
                    console.error('[line-webhook] Earnings error:', err);
                }
                continue;
            }

            // Default: Add quote to database
            try {
                await c.env.DB.prepare(`INSERT INTO quotes (quote_text) VALUES (?)`).bind(text).run();

                if (LINE_TOKEN) {
                    const now = new Date();
                    const timeStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' }) + ' ' +
                        now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

                    await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                        body: JSON.stringify({
                            replyToken: event.replyToken,
                            messages: [{ type: 'text', text: `✅ เพิ่มคำคมสำเร็จ\n📝 ${text.slice(0, 50)}${text.length > 50 ? '...' : ''}\n🕐 ${timeStr}` }]
                        })
                    });
                }
            } catch (err) {
                console.error('[line-webhook] DB error:', err);
            }
        }

        return c.text('OK');
    } catch (err) {
        console.error('[line-webhook] Error:', err);
        return c.json({ error: String(err) }, 500);
    }
});

app.get('/', (c) => c.text('LINE Webhook OK'));

export { app as lineWebhookRouter };
