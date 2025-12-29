import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET for simple trigger
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Create connection directly here
    const sql = neon(process.env.DATABASE_URL!);

    // Create page_settings table if not exists
    await sql`
      CREATE TABLE IF NOT EXISTS page_settings (
        page_id TEXT PRIMARY KEY,
        auto_schedule BOOLEAN DEFAULT false,
        schedule_minutes TEXT DEFAULT '00, 15, 30, 45',
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    console.log('[migrate] page_settings table created/verified');

    // Fetch all data to show
    const settings = await sql`SELECT * FROM page_settings ORDER BY updated_at DESC`;

    return res.status(200).json({
      success: true,
      message: 'Migration completed: page_settings table created',
      table: 'page_settings',
      rowCount: settings.length,
      data: settings
    });
  } catch (error) {
    console.error('[migrate] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
