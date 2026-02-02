import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

const DOC_ID = "25358568403813021";

// Text post with optional GraphQL edit mode
app.post('/', async (c) => {
    try {
        const { pageId, message, shareToPages, userId, iUser } = await c.req.json();

        if (!pageId || !message || !userId) {
            return c.json({ error: 'Missing pageId, message, or userId' }, 400);
        }

        // Get user token
        const user = await c.env.DB.prepare(`SELECT post_token, cookie, fb_dtsg FROM tokens WHERE user_id = ?`)
            .bind(userId).first<{ post_token: string; cookie: string; fb_dtsg: string }>();

        if (!user?.post_token) {
            return c.json({ error: 'Missing user token' }, 400);
        }

        // Get page token from Facebook
        const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&access_token=${user.post_token}`);
        const pagesData = await pagesRes.json() as any;
        const pageToken = pagesData.data?.find((p: any) => p.id === pageId)?.access_token;

        if (!pageToken) {
            return c.json({ error: 'Page token not found' }, 400);
        }

        let postId: string;
        let editSuccess = false;
        let editError: string | undefined;

        if (iUser && user.cookie && user.fb_dtsg) {
            // GraphQL edit mode
            const photoRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url: 'https://picsum.photos/800/600', message, access_token: pageToken })
            });
            const photoData = await photoRes.json() as any;
            if (photoData.error) return c.json({ error: photoData.error.message }, 400);
            postId = photoData.post_id;

            await new Promise(r => setTimeout(r, 2000));

            const actualPostId = postId.split('_')[1];
            const storyId = btoa(`S:_I${iUser}:${actualPostId}:${actualPostId}`);

            const variables = {
                input: {
                    story_id: storyId, attachments: [],
                    audience: { privacy: { allow: [], base_state: 'EVERYONE', deny: [], tag_expansion_state: 'UNSPECIFIED' } },
                    message: { ranges: [], text: message },
                    text_format_preset_id: '0',
                    actor_id: iUser, client_mutation_id: '1'
                }
            };

            const editRes = await fetch('https://www.facebook.com/api/graphql/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': user.cookie, 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://www.facebook.com' },
                body: new URLSearchParams({ av: iUser, __user: iUser, __a: '1', fb_dtsg: user.fb_dtsg, fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'ComposerStoryEditMutation', variables: JSON.stringify(variables), doc_id: DOC_ID }).toString()
            });
            const editText = await editRes.text();
            editSuccess = editText.includes('"attachments":[]');
            if (!editSuccess) editError = editText.slice(0, 200);
        } else {
            // Simple text post
            const postRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message, access_token: pageToken })
            });
            const postData = await postRes.json() as any;
            if (postData.error) return c.json({ error: postData.error.message }, 400);
            postId = postData.id;
        }

        // Share to other pages
        const shareResults: { pageId: string; success: boolean; error?: string }[] = [];
        if (shareToPages?.length) {
            await new Promise(r => setTimeout(r, 1000));
            for (const targetPageId of shareToPages) {
                if (targetPageId === pageId) continue;
                const targetToken = pagesData.data?.find((p: any) => p.id === targetPageId)?.access_token;
                if (!targetToken) {
                    shareResults.push({ pageId: targetPageId, success: false, error: 'No token' });
                    continue;
                }
                const shareRes = await fetch(`https://graph.facebook.com/v21.0/${targetPageId}/feed`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ link: `https://www.facebook.com/${postId}`, access_token: targetToken })
                });
                const shareData = await shareRes.json() as any;
                shareResults.push({ pageId: targetPageId, success: !!shareData.id, error: shareData.error?.message });
            }
        }

        return c.json({ success: true, postId, editSuccess, editError, shareResults });
    } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
});

export { app as textPostRouter };
