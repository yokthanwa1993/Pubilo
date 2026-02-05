import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

interface LastPostLog {
    page_id: string;
    page_name: string;
    status: string;
    created_at: string;
    minutes_ago: number;
}

// GET /api/cron/health-check - Check if auto-post is working
// Runs every hour via cron, alerts if no posts in last hour
app.get('/', async (c) => {
    const forceNotify = c.req.query('force') === 'true';
    const thresholdMinutes = parseInt(c.req.query('threshold') || '60'); // Default 1 hour

    try {
        // Get latest successful post from each page
        const latestPosts = await c.env.DB.prepare(`
            SELECT 
                apl.page_id,
                ps.page_name,
                apl.status,
                apl.created_at,
                apl.post_type
            FROM auto_post_logs apl
            JOIN page_settings ps ON apl.page_id = ps.page_id
            WHERE apl.status = 'success'
            AND apl.id IN (
                SELECT MAX(id) FROM auto_post_logs 
                WHERE status = 'success'
                GROUP BY page_id
            )
            ORDER BY apl.created_at DESC
        `).all<{
            page_id: string;
            page_name: string;
            status: string;
            created_at: string;
            post_type: string;
        }>();

        const posts = latestPosts.results || [];
        const now = new Date();

        // Calculate minutes since last post for each page
        const pageStatuses: LastPostLog[] = posts.map(post => {
            // created_at is stored in Thai time format: "2026-02-06 00:15:42"
            // Parse as Thai time (+07:00), then compare with current UTC time
            const postTime = new Date(post.created_at.replace(' ', 'T') + '+07:00');
            const minutesAgo = Math.floor((now.getTime() - postTime.getTime()) / (1000 * 60));

            return {
                page_id: post.page_id,
                page_name: post.page_name || 'Unknown',
                status: post.status,
                created_at: post.created_at,
                minutes_ago: minutesAgo,
            };
        });

        // Find the most recent post across all pages
        const mostRecentPost = pageStatuses.reduce((latest, current) =>
            current.minutes_ago < latest.minutes_ago ? current : latest
            , pageStatuses[0] || { minutes_ago: 9999 });

        // Check if system is healthy
        const isHealthy = mostRecentPost && mostRecentPost.minutes_ago < thresholdMinutes;
        const stalePages = pageStatuses.filter(p => p.minutes_ago >= thresholdMinutes);

        // Thai time for display
        const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
        const thaiTimeStr = thaiNow.toISOString().replace('T', ' ').slice(0, 19);

        // Send alert if unhealthy or force notify
        let notificationSent = false;
        if ((!isHealthy || forceNotify) && c.env.LINE_CHANNEL_ACCESS_TOKEN && c.env.LINE_USER_ID) {
            const alertMessage = buildAlertMessage(isHealthy, mostRecentPost, stalePages, thresholdMinutes, thaiTimeStr);

            try {
                await sendLineNotification(
                    c.env.LINE_CHANNEL_ACCESS_TOKEN,
                    c.env.LINE_USER_ID,
                    alertMessage
                );
                notificationSent = true;
            } catch (err) {
                console.error('Failed to send LINE notification:', err);
            }
        }

        return c.json({
            success: true,
            healthy: isHealthy,
            threshold_minutes: thresholdMinutes,
            most_recent_post: mostRecentPost ? {
                page_name: mostRecentPost.page_name,
                minutes_ago: mostRecentPost.minutes_ago,
                created_at: mostRecentPost.created_at,
            } : null,
            stale_pages: stalePages.length,
            pages: pageStatuses,
            notification_sent: notificationSent,
            checked_at: thaiTimeStr,
        });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

function buildAlertMessage(
    isHealthy: boolean,
    mostRecentPost: LastPostLog | null,
    stalePages: LastPostLog[],
    thresholdMinutes: number,
    timeStr: string
): string {

    if (!mostRecentPost) {
        return `🚨 PUBILO ALERT 🚨

⚠️ ไม่พบ log การโพสต์ในระบบ

🕐 เช็คเมื่อ: ${timeStr}

กรุณาตรวจสอบระบบ auto-post`;
    }

    if (!isHealthy) {
        const hoursAgo = Math.floor(mostRecentPost.minutes_ago / 60);
        const minsAgo = mostRecentPost.minutes_ago % 60;
        const timeAgoStr = hoursAgo > 0 ? `${hoursAgo} ชม. ${minsAgo} นาที` : `${minsAgo} นาที`;

        return `🚨 PUBILO ALERT 🚨

❌ ระบบ Auto-Post หยุดทำงาน!

📊 โพสต์ล่าสุด:
• เพจ: ${mostRecentPost.page_name}
• เวลา: ${mostRecentPost.created_at}
• ผ่านไปแล้ว: ${timeAgoStr}

⏰ Threshold: ${thresholdMinutes} นาที

🕐 เช็คเมื่อ: ${timeStr}

กรุณาตรวจสอบ cron และ tokens`;
    }

    // Force notify but system is healthy
    return `✅ PUBILO STATUS ✅

ระบบทำงานปกติ

📊 โพสต์ล่าสุด:
• เพจ: ${mostRecentPost.page_name}  
• เวลา: ${mostRecentPost.created_at}
• ผ่านไป: ${mostRecentPost.minutes_ago} นาที

🕐 เช็คเมื่อ: ${timeStr}`;
}

async function sendLineNotification(
    channelAccessToken: string,
    userId: string,
    message: string
): Promise<void> {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${channelAccessToken}`,
        },
        body: JSON.stringify({
            to: userId,
            messages: [{ type: 'text', text: message }],
        }),
    });

    if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`LINE API error: ${response.status} - ${errorData}`);
    }
}

export { app as cronHealthCheckRouter };
