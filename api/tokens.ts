import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (!dbUrl) {
    return res.status(500).json({ success: false, error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    if (req.method === 'GET') {
      const userId = req.query.userId as string;
      if (!userId) {
        await sql.end();
        return res.status(400).json({ success: false, error: 'Missing userId' });
      }

      const result = await sql`
        SELECT * FROM tokens WHERE user_id = ${userId} LIMIT 1
      `;

      await sql.end();

      if (result.length === 0) {
        return res.status(200).json({ success: true, tokens: null });
      }

      const token = result[0];
      return res.status(200).json({
        success: true,
        tokens: {
          userId: token.user_id,
          userName: token.user_name,
          accessToken: token.access_token,
          postToken: token.post_token,
          fbDtsg: token.fb_dtsg,
          cookie: token.cookie,
          updatedAt: token.updated_at
        }
      });
    }

    if (req.method === 'POST') {
      const { userId, userName, accessToken, postToken, fbDtsg, cookie } = req.body;

      if (!userId) {
        await sql.end();
        return res.status(400).json({ success: false, error: 'Missing userId' });
      }

      const nowStr = new Date().toISOString();

      // Upsert tokens
      const result = await sql`
        INSERT INTO tokens (user_id, user_name, access_token, post_token, fb_dtsg, cookie, updated_at)
        VALUES (${userId}, ${userName || null}, ${accessToken || null}, ${postToken || null}, ${fbDtsg || null}, ${cookie || null}, ${nowStr})
        ON CONFLICT (user_id) DO UPDATE SET
          user_name = COALESCE(${userName || null}, tokens.user_name),
          access_token = COALESCE(${accessToken || null}, tokens.access_token),
          post_token = COALESCE(${postToken || null}, tokens.post_token),
          fb_dtsg = COALESCE(${fbDtsg || null}, tokens.fb_dtsg),
          cookie = COALESCE(${cookie || null}, tokens.cookie),
          updated_at = ${nowStr}
        RETURNING *
      `;

      console.log('[tokens] Saved for user', userId, '- has accessToken:', !!accessToken, 'postToken:', !!postToken);

      // If we have postToken, fetch pages and store their tokens
      let pagesUpdated = 0;
      if (postToken) {
        try {
          const pagesResponse = await fetch(
            `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${postToken}`
          );
          const pagesData = await pagesResponse.json();

          if (pagesData.data && Array.isArray(pagesData.data)) {
            for (const page of pagesData.data) {
              // Store page token and page name
              await sql`
                INSERT INTO auto_post_config (page_id, post_token, page_name, updated_at)
                VALUES (${page.id}, ${page.access_token}, ${page.name}, ${nowStr})
                ON CONFLICT (page_id) DO UPDATE SET
                  post_token = ${page.access_token},
                  page_name = ${page.name},
                  updated_at = ${nowStr}
              `;
              pagesUpdated++;
              console.log('[tokens] Stored page token for', page.name, '(', page.id, ')');
            }
          }
        } catch (pageError) {
          console.error('[tokens] Error fetching pages:', pageError);
        }
      }

      await sql.end();
      return res.status(200).json({ success: true, token: result[0], pagesUpdated });
    }

    await sql.end();
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    await sql.end();
    console.error('[tokens] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
