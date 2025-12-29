import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { imageData } = req.body;

    if (!imageData) {
      return res.status(400).json({ success: false, error: 'No image data provided' });
    }

    // If already a URL (not base64), return as-is
    if (!imageData.startsWith('data:')) {
      return res.status(200).json({ success: true, url: imageData });
    }

    // Upload base64 to freeimage.host
    const FREEIMAGE_API_KEY = process.env.FREEIMAGE_API_KEY;
    if (!FREEIMAGE_API_KEY) {
      return res.status(500).json({ success: false, error: 'FREEIMAGE_API_KEY not configured' });
    }

    const base64Content = imageData.replace(/^data:image\/\w+;base64,/, '');
    const formData = new FormData();
    formData.append('key', FREEIMAGE_API_KEY);
    formData.append('source', base64Content);
    formData.append('format', 'json');

    const response = await fetch('https://freeimage.host/api/1/upload', {
      method: 'POST',
      body: formData,
    });

    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return res.status(500).json({ success: false, error: `Failed to parse response: ${text.substring(0, 100)}` });
    }

    if (!data.image?.url) {
      return res.status(500).json({ success: false, error: data.error?.message || 'Upload failed' });
    }

    return res.status(200).json({ success: true, url: data.image.url });

  } catch (error) {
    console.error('[Upload] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
