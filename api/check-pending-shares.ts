import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
              process.env.SUPABASE_POSTGRES_URL ||
              process.env.POSTGRES_URL ||
              process.env.DATABASE_URL || "";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (!dbUrl) {
    return res.status(500).json({ error: 'Database not configured' });
  }

  const sql = postgres(dbUrl, { ssl: dbUrl.includes('sslmode=disable') ? false : 'require' });

  try {
    // Get pending shares with source page share schedule
    const pendingShares = await sql`
      SELECT
        sq.id,
        sq.source_page_id,
        sq.target_page_id,
        sq.facebook_post_id,
        sq.post_type,
        sq.status,
        sq.created_at,
        ps.share_schedule_minutes,
        ps.page_name as source_page_name
      FROM share_queue sq
      LEFT JOIN page_settings ps ON sq.source_page_id = ps.page_id
      WHERE sq.status = 'pending'
      ORDER BY sq.created_at ASC
    `;

    // Get current time in Thailand
    const now = new Date();
    const thaiNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const currentMinute = thaiNow.getUTCMinutes();
    const currentHour = thaiNow.getUTCHours();

    await sql.end();

    return res.status(200).json({
      success: true,
      currentTime: `${currentHour}:${currentMinute.toString().padStart(2, '0')}`,
      pendingCount: pendingShares.length,
      pendingShares
    });
  } catch (error) {
    await sql.end();
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
