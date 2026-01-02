import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cUserId = req.query.userId as string;
  
  if (!cUserId) {
    return res.status(400).json({ success: false, error: 'Missing userId' });
  }

  const sql = postgres(dbUrl, { ssl: 'require' });

  try {
    // ดึง post_token ของ user (ใช้ c_user เป็น key)
    const [user] = await sql`SELECT post_token, cookie FROM tokens WHERE user_id = ${cUserId}`;
    
    if (!user?.post_token) {
      await sql.end();
      return res.status(200).json({ success: true, pages: [] });
    }

    // ดึง pages จาก Graph API
    const pagesRes = await fetch(
      `https://graph.facebook.com/v21.0/me/accounts?fields=id,name&access_token=${user.post_token}`
    );
    const pagesData = await pagesRes.json();

    // เช็คว่ามี i_user ใน cookie ไหม (สำหรับ GraphQL edit)
    const hasIUser = user.cookie?.includes('i_user=');

    await sql.end();

    if (pagesData.data) {
      return res.status(200).json({
        success: true,
        pages: pagesData.data.map((p: any) => ({ page_id: p.id, page_name: p.name })),
        hasIUser
      });
    }

    return res.status(200).json({ success: true, pages: [], hasIUser });

  } catch (error: any) {
    await sql.end();
    return res.status(500).json({ success: false, error: error.message });
  }
}
