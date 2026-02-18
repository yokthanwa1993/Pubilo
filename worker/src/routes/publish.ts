import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

const FB_API = 'https://graph.facebook.com/v21.0';

// POST /api/publish - Publish to Facebook
app.post('/', async (c) => {
    try {
        const { pageId, pageToken, accessToken, cookieData, message, imageUrl, scheduledTime, link,
            linkUrl, linkName, caption, description, primaryText, postMode, adAccountId, fbDtsg } = await c.req.json();

        if (!pageId) {
            return c.json({ success: false, error: 'Missing pageId' }, 400);
        }

        // Resolve Page Token in priority order:
        // 1. Directly provided pageToken
        // 2. From page_settings.post_token in D1 (same as cron-auto-post)
        // 3. Fetch from Facebook using accessToken (User Token)
        let resolvedPageToken = pageToken;

        if (!resolvedPageToken) {
            // Try D1 database first
            console.log('[publish] No pageToken provided, checking D1 page_settings...');
            try {
                const dbResult = await c.env.DB.prepare(
                    'SELECT post_token FROM page_settings WHERE page_id = ? LIMIT 1'
                ).bind(pageId).first<{ post_token: string | null }>();

                if (dbResult?.post_token) {
                    resolvedPageToken = dbResult.post_token;
                    console.log('[publish] Got Page Token from D1 page_settings');
                }
            } catch (dbErr) {
                console.error('[publish] D1 error:', dbErr);
            }
        }

        if (!resolvedPageToken && accessToken) {
            // Fallback: try to fetch from Facebook using accessToken (User Token)
            console.log('[publish] Trying to fetch Page Token from Facebook using accessToken...');
            try {
                const tokenRes = await fetch(
                    `${FB_API}/${pageId}?fields=access_token&access_token=${accessToken}`
                );
                const tokenData = await tokenRes.json() as any;

                if (tokenData.access_token) {
                    resolvedPageToken = tokenData.access_token;
                    console.log('[publish] Got Page Token from Facebook Graph API');
                } else if (tokenData.error) {
                    console.warn('[publish] Facebook token fetch failed:', tokenData.error.message);
                }
            } catch (fetchErr) {
                console.warn('[publish] Error fetching from Facebook:', fetchErr);
            }
        }

        if (!resolvedPageToken) {
            return c.json({
                success: false,
                error: 'ไม่พบ Page Token - กรุณาใส่ใน Settings > 🔑 Page Token'
            }, 400);
        }

        let endpoint = `${FB_API}/${pageId}`;
        const params = new URLSearchParams({ access_token: resolvedPageToken });

        // Determine post type
        const finalMessage = message || primaryText || '';
        const finalLink = link || linkUrl || '';
        let finalImageUrl = imageUrl || '';

        // If image is base64, upload to image host first
        if (finalImageUrl && finalImageUrl.startsWith('data:')) {
            console.log('[publish] Uploading base64 image to freeimage.host...');
            try {
                const base64Only = finalImageUrl.replace(/^data:image\/\w+;base64,/, '');
                const formData = new FormData();
                formData.append('key', c.env.FREEIMAGE_API_KEY);
                formData.append('source', base64Only);
                formData.append('format', 'json');

                const uploadRes = await fetch('https://freeimage.host/api/1/upload', { method: 'POST', body: formData });
                if (!uploadRes.ok) throw new Error(`Upload failed: ${uploadRes.status}`);

                const uploadData = await uploadRes.json() as any;
                if (!uploadData.image?.url) throw new Error('No URL from image host');

                finalImageUrl = uploadData.image.url;
                console.log('[publish] Image uploaded:', finalImageUrl);
            } catch (uploadErr) {
                console.error('[publish] Image upload error:', uploadErr);
                return c.json({ success: false, error: 'Failed to upload image: ' + String(uploadErr) }, 500);
            }
        }

        if (finalImageUrl && finalImageUrl.startsWith('http')) {
            // Photo post — include link in caption if available
            endpoint += '/photos';
            params.append('url', finalImageUrl);
            const captionParts = [];
            if (finalMessage) captionParts.push(finalMessage);
            if (finalLink) captionParts.push(finalLink);
            if (captionParts.length) params.append('caption', captionParts.join('\n\n'));
        } else if (finalLink) {
            endpoint += '/feed';
            params.append('link', finalLink);
            if (finalMessage) params.append('message', finalMessage);
        } else {
            endpoint += '/feed';
            if (finalMessage) params.append('message', finalMessage);
        }

        // Schedule if time provided
        if (scheduledTime) {
            const timestamp = typeof scheduledTime === 'number'
                ? scheduledTime
                : Math.floor(new Date(scheduledTime).getTime() / 1000);
            params.append('scheduled_publish_time', String(timestamp));
            params.append('published', 'false');
        }

        console.log('[publish] Posting to:', endpoint);
        console.log('[publish] Post mode:', postMode, '| Has link:', !!finalLink, '| Has image:', !!finalImageUrl);

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: params.toString(),
        });

        const data = await response.json() as any;

        if (data.error) {
            console.error('[publish] Facebook API error:', data.error);
            return c.json({ success: false, error: data.error.message }, 400);
        }

        console.log('[publish] Success! Post ID:', data.id || data.post_id);
        return c.json({ success: true, postId: data.id || data.post_id });
    } catch (error) {
        console.error('[publish] Server error:', error);
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as publishRouter };
