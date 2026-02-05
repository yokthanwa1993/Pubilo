import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// LINE Webhook handler
app.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const events = body.events || [];
        const LINE_TOKEN = c.env.LINE_CHANNEL_ACCESS_TOKEN;

        console.log('[line-webhook] Received', events.length, 'events, LINE_TOKEN:', LINE_TOKEN ? 'present' : 'MISSING');

        for (const event of events) {
            console.log('[line-webhook] Event type:', event.type, 'message type:', event.message?.type, 'text:', event.message?.text?.slice(0, 30));
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

            // Command: /earnings - Read from cached earnings_history (fast!)
            if (text.toLowerCase() === 'earnings' || text.toLowerCase() === '/earnings') {
                console.log('[line-webhook] Earnings command received');
                try {
                    // Get latest earnings from cache with real page colors
                    const earnings = await c.env.DB.prepare(`
                        SELECT e.page_id, e.page_name, e.date, e.daily_earnings, e.weekly_earnings, e.monthly_earnings,
                               COALESCE(p.page_color, '#666666') as page_color
                        FROM earnings_history e
                        LEFT JOIN page_settings p ON e.page_id = p.page_id
                        WHERE e.date = (SELECT MAX(date) FROM earnings_history)
                        ORDER BY e.daily_earnings DESC
                    `).all<{ page_id: string; page_name: string; date: string; daily_earnings: number; weekly_earnings: number; monthly_earnings: number; page_color: string }>();

                    if (!earnings.results?.length) {
                        if (LINE_TOKEN) {
                            await fetch('https://api.line.me/v2/bot/message/reply', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                                body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: '❌ ยังไม่มีข้อมูล earnings กรุณารอ cron ดึงข้อมูล' }] })
                            });
                        }
                        continue;
                    }

                    // Calculate totals from cache
                    let totalDaily = 0;
                    let totalWeekly = 0;
                    let totalMonthly = 0;
                    const pageResults: { pageName: string; daily: number; color: string }[] = [];

                    for (const row of earnings.results) {
                        totalDaily += row.daily_earnings || 0;
                        totalWeekly += row.weekly_earnings || 0;
                        totalMonthly += row.monthly_earnings || 0;
                        pageResults.push({ pageName: row.page_name || row.page_id, daily: row.daily_earnings || 0, color: row.page_color });
                    }

                    // Build Flex Message with real page colors
                    const dataDate = earnings.results[0].date;
                    const displayDate = new Date(dataDate + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });

                    const pageContents = pageResults.map((r) => ({
                        type: 'box',
                        layout: 'horizontal',
                        contents: [
                            { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: '●', size: 'xs', color: r.color }], width: '20px', alignItems: 'center', justifyContent: 'center' },
                            { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: r.pageName.length > 8 ? r.pageName.slice(0, 8) : r.pageName, size: 'sm', color: '#333333' }], flex: 4 },
                            { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `$${r.daily.toFixed(2)}`, size: 'md', color: r.color, weight: 'bold', align: 'end' }], flex: 3 }
                        ],
                        backgroundColor: '#F8F9FA',
                        paddingAll: 'md',
                        cornerRadius: 'lg',
                        margin: 'sm'
                    }));

                    const flexMessage = {
                        type: 'flex',
                        altText: `💰 รายได้วันนี้: $${totalDaily.toFixed(2)}`,
                        contents: {
                            type: 'bubble',
                            size: 'mega',
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    {
                                        type: 'box', layout: 'horizontal', contents: [
                                            { type: 'text', text: '💰 Earnings', size: 'md', color: '#333333', weight: 'bold', flex: 1 },
                                            { type: 'text', text: displayDate, size: 'xs', color: '#999999', align: 'end', gravity: 'center' }
                                        ], paddingBottom: 'lg'
                                    },
                                    {
                                        type: 'box', layout: 'vertical', contents: [
                                            { type: 'text', text: 'TODAY', size: 'xxs', color: '#1DB954', weight: 'bold' },
                                            { type: 'text', text: `$${totalDaily.toFixed(2)}`, size: '3xl', weight: 'bold', color: '#1DB954' }
                                        ], backgroundColor: '#E8F5E9', paddingAll: 'lg', cornerRadius: 'lg', alignItems: 'center'
                                    },
                                    {
                                        type: 'box', layout: 'horizontal', contents: [
                                            {
                                                type: 'box', layout: 'vertical', contents: [
                                                    { type: 'text', text: 'WEEKLY', size: 'xxs', color: '#2196F3', weight: 'bold' },
                                                    { type: 'text', text: `$${totalWeekly.toFixed(2)}`, size: 'lg', weight: 'bold', color: '#2196F3' }
                                                ], flex: 1, backgroundColor: '#E3F2FD', paddingAll: 'md', cornerRadius: 'lg', alignItems: 'center'
                                            },
                                            {
                                                type: 'box', layout: 'vertical', contents: [
                                                    { type: 'text', text: '28-DAY', size: 'xxs', color: '#FF5722', weight: 'bold' },
                                                    { type: 'text', text: `$${totalMonthly.toFixed(2)}`, size: 'lg', weight: 'bold', color: '#FF5722' }
                                                ], flex: 1, backgroundColor: '#FBE9E7', paddingAll: 'md', cornerRadius: 'lg', alignItems: 'center', margin: 'sm'
                                            }
                                        ], paddingTop: 'md'
                                    },
                                    { type: 'separator', color: '#EEEEEE', margin: 'lg' },
                                    { type: 'text', text: 'PAGE', size: 'xs', color: '#999999', margin: 'lg' },
                                    ...pageContents
                                ],
                                paddingAll: 'lg',
                                backgroundColor: '#ffffff'
                            }
                        }
                    };

                    if (LINE_TOKEN) {
                        const replyRes = await fetch('https://api.line.me/v2/bot/message/reply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                            body: JSON.stringify({ replyToken: event.replyToken, messages: [flexMessage] })
                        });
                        console.log('[line-webhook] Flex reply sent:', replyRes.status);
                    }
                } catch (err) {
                    console.error('[line-webhook] Earnings error:', err);
                    if (LINE_TOKEN) {
                        await fetch('https://api.line.me/v2/bot/message/reply', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                            body: JSON.stringify({ replyToken: event.replyToken, messages: [{ type: 'text', text: `❌ Error: ${err}` }] })
                        });
                    }
                }
                continue;
            }

            // Default: Add quote to database
            console.log('[line-webhook] Adding quote:', text.slice(0, 30));
            try {
                await c.env.DB.prepare(`INSERT INTO quotes (quote_text) VALUES (?)`).bind(text).run();
                console.log('[line-webhook] Quote saved to DB');

                if (LINE_TOKEN) {
                    const now = new Date(Date.now() + 7 * 60 * 60 * 1000);
                    const timeStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit' }) + ' ' +
                        now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });

                    const quoteFlexMessage = {
                        type: 'flex',
                        altText: '✅ เพิ่มคำคมสำเร็จ',
                        contents: {
                            type: 'bubble',
                            size: 'kilo',
                            header: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    {
                                        type: 'text',
                                        text: '✅ เพิ่มคำคมสำเร็จ',
                                        weight: 'bold',
                                        size: 'lg',
                                        color: '#ffffff'
                                    }
                                ],
                                backgroundColor: '#27ae60',
                                paddingAll: 'lg'
                            },
                            body: {
                                type: 'box',
                                layout: 'vertical',
                                contents: [
                                    {
                                        type: 'text',
                                        text: text.length > 100 ? text.slice(0, 100) + '...' : text,
                                        wrap: true,
                                        size: 'md',
                                        color: '#333333'
                                    },
                                    {
                                        type: 'separator',
                                        margin: 'lg'
                                    },
                                    {
                                        type: 'box',
                                        layout: 'horizontal',
                                        contents: [
                                            {
                                                type: 'text',
                                                text: '🕐 ' + timeStr,
                                                size: 'xs',
                                                color: '#888888'
                                            }
                                        ],
                                        margin: 'md'
                                    }
                                ],
                                paddingAll: 'lg'
                            }
                        }
                    };

                    const replyRes = await fetch('https://api.line.me/v2/bot/message/reply', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LINE_TOKEN}` },
                        body: JSON.stringify({
                            replyToken: event.replyToken,
                            messages: [quoteFlexMessage]
                        })
                    });
                    console.log('[line-webhook] Reply status:', replyRes.status);
                } else {
                    console.log('[line-webhook] No LINE_TOKEN, skipping reply');
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
