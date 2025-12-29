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
    const { postId, pageToken, scheduledTime } = req.body;

    if (!postId) {
      return res.status(400).json({ success: false, error: 'Missing postId' });
    }
    if (!pageToken) {
      return res.status(400).json({ success: false, error: 'Missing pageToken' });
    }
    if (!scheduledTime) {
      return res.status(400).json({ success: false, error: 'Missing scheduledTime' });
    }

    // Update scheduled time via Facebook Graph API
    const url = `${API_BASE}/${postId}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        access_token: pageToken,
        scheduled_publish_time: scheduledTime
      })
    });
    const data = await response.json();

    console.log('[update-post-time] FB response:', JSON.stringify(data, null, 2));

    if (data.error) {
      console.error('[update-post-time] Facebook API error:', data.error);
      return res.status(200).json({
        success: false,
        error: data.error.message || 'Facebook API error',
      });
    }

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error('[update-post-time] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
