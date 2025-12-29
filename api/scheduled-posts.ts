import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_VERSION = "v21.0";
const API_BASE = `https://graph.facebook.com/${API_VERSION}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pageId, pageToken } = req.body;

    if (!pageId) {
      return res.status(400).json({ success: false, error: 'Missing pageId' });
    }
    if (!pageToken) {
      return res.status(400).json({ success: false, error: 'Missing pageToken' });
    }

    // Fetch scheduled posts from Facebook Graph API
    const fields = 'id,message,created_time,scheduled_publish_time,full_picture,picture,status_type';
    const url = `${API_BASE}/${pageId}/scheduled_posts?access_token=${pageToken}&fields=${fields}`;

    const response = await fetch(url);
    const data = await response.json();

    console.log('[scheduled-posts] Raw FB response:', JSON.stringify(data, null, 2));

    if (data.error) {
      console.error('[scheduled-posts] Facebook API error:', data.error);
      return res.status(200).json({
        success: false,
        error: data.error.message || 'Facebook API error',
      });
    }

    // Transform posts to a consistent format
    const posts = (data.data || []).map((post: any) => {
      // Determine post type from status_type
      let postType = 'link'; // default
      if (post.status_type === 'added_photos') {
        postType = 'image';
      } else if (post.status_type === 'added_video') {
        postType = 'reels';
      } else if (post.status_type === 'shared_story') {
        postType = 'link';
      }

      return {
        id: post.id,
        message: post.message || '',
        createdTime: post.created_time,
        scheduledTime: post.scheduled_publish_time,
        imageUrl: post.full_picture || post.picture || null,
        postType,
      };
    });

    return res.status(200).json({
      success: true,
      posts,
    });
  } catch (error) {
    console.error('[scheduled-posts] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
