import type { VercelRequest, VercelResponse } from '@vercel/node';

// In-memory storage (will reset on cold start - use Vercel KV/Postgres for persistence)
let storedTokens: {
  accessToken?: string;
  postToken?: string;
  cookie?: string;
  fbDtsg?: string;
  pageId?: string;
  adAccountId?: string;
  userName?: string;
  userId?: string;
} = {};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method === 'POST') {
    // Save tokens
    const body = req.body;

    if (body.accessToken) storedTokens.accessToken = body.accessToken;
    if (body.postToken) storedTokens.postToken = body.postToken;
    if (body.cookie) storedTokens.cookie = body.cookie;
    if (body.fbDtsg) storedTokens.fbDtsg = body.fbDtsg;
    if (body.pageId) storedTokens.pageId = body.pageId;
    if (body.adAccountId) storedTokens.adAccountId = body.adAccountId;
    if (body.userName) storedTokens.userName = body.userName;
    if (body.userId) storedTokens.userId = body.userId;

    console.log('[Pubilo] Received tokens:', {
      hasAccessToken: !!storedTokens.accessToken,
      hasPostToken: !!storedTokens.postToken,
      hasCookie: !!storedTokens.cookie,
      hasFbDtsg: !!storedTokens.fbDtsg,
      pageId: storedTokens.pageId,
      adAccountId: storedTokens.adAccountId,
    });

    return res.status(200).json({ success: true });
  }

  if (req.method === 'GET') {
    // Return tokens
    return res.status(200).json(storedTokens);
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
