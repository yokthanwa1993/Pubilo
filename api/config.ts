import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  // Return configuration
  return res.status(200).json({
    adAccountId: process.env.AD_ACCOUNT_ID || '',
    defaults: {
      caption: '',
      description: ''
    }
  });
}
