import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING || "";
const DOC_ID = "25358568403813021";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { pageId, message, shareToPages, userId, iUser } = req.body;

  if (!pageId || !message || !userId) {
    return res.status(400).json({ error: 'Missing pageId, message, or userId' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    const [user] = await sql`SELECT post_token, cookie, fb_dtsg FROM tokens WHERE user_id = ${userId}`;
    if (!user?.post_token) {
      await sql.end();
      return res.status(400).json({ error: 'Missing user token' });
    }

    // Get page token
    const pagesRes = await fetch(`https://graph.facebook.com/v21.0/me/accounts?fields=id,access_token&access_token=${user.post_token}`);
    const pagesData = await pagesRes.json();
    const pageToken = pagesData.data?.find((p: any) => p.id === pageId)?.access_token;
    if (!pageToken) {
      await sql.end();
      return res.status(400).json({ error: 'Page token not found' });
    }

    let postId: string;
    let editSuccess = false;
    let editError: string | undefined;

    // ถ้ามี iUser → ใช้ GraphQL edit
    if (iUser && user.cookie && user.fb_dtsg) {
      // 1. Create photo post
      const photoRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/photos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: 'https://picsum.photos/800/600', message, access_token: pageToken })
      });
      const photoData = await photoRes.json();
      if (photoData.error) {
        await sql.end();
        return res.status(400).json({ error: photoData.error.message });
      }
      postId = photoData.post_id;

      await new Promise(r => setTimeout(r, 2000));

      // 2. Edit via GraphQL - ลบรูป
      const actualPostId = postId.split('_')[1];
      const storyId = Buffer.from(`S:_I${iUser}:${actualPostId}:${actualPostId}`).toString('base64');

      const variables = {
        input: {
          story_id: storyId, attachments: [],
          audience: { privacy: { allow: [], base_state: 'EVERYONE', deny: [], tag_expansion_state: 'UNSPECIFIED' } },
          message: { ranges: [], text: message },
          with_tags_ids: [], text_format_preset_id: '0',
          reels_remix: { is_original_audio_reusable: true, remix_status: 'ENABLED' },
          tracking: [null], logging: { composer_session_id: crypto.randomUUID() },
          editable_post_feature_capabilities: ['CONTAINED_LINK', 'CONTAINED_MEDIA', 'POLL'],
          actor_id: iUser, client_mutation_id: '1'
        },
        feedLocation: 'NEWSFEED', feedbackSource: 1, focusCommentID: null, scale: 2,
        privacySelectorRenderLocation: 'COMET_STREAM', renderLocation: 'permalink',
        useDefaultActor: false, isGroupViewerContent: false, isSocialLearning: false, isWorkDraftFor: false,
        '__relay_internal__pv__CometUFIShareActionMigrationrelayprovider': true,
        '__relay_internal__pv__FBReels_deprecate_short_form_video_context_gkrelayprovider': true
      };

      const editRes = await fetch('https://www.facebook.com/api/graphql/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Cookie': user.cookie, 'User-Agent': 'Mozilla/5.0', 'Origin': 'https://www.facebook.com'
        },
        body: new URLSearchParams({
          av: iUser, __user: iUser, __a: '1', fb_dtsg: user.fb_dtsg,
          fb_api_caller_class: 'RelayModern', fb_api_req_friendly_name: 'ComposerStoryEditMutation',
          variables: JSON.stringify(variables), doc_id: DOC_ID
        }).toString()
      });

      const editText = await editRes.text();
      editSuccess = editText.includes('"attachments":[]');
      if (!editSuccess) editError = editText.slice(0, 200);

    } else {
      // Simple mode: Direct text post
      const postRes = await fetch(`https://graph.facebook.com/v21.0/${pageId}/feed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, access_token: pageToken })
      });
      const postData = await postRes.json();
      if (postData.error) {
        await sql.end();
        return res.status(400).json({ error: postData.error.message });
      }
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
        const shareData = await shareRes.json();
        shareResults.push({ pageId: targetPageId, success: !!shareData.id, error: shareData.error?.message });
      }
    }

    await sql.end();
    return res.status(200).json({ success: true, postId, editSuccess, editError, shareResults });

  } catch (error: any) {
    await sql.end();
    return res.status(500).json({ error: error.message });
  }
}
