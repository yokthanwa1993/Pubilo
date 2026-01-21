import type { VercelRequest, VercelResponse } from '@vercel/node';
import postgres from 'postgres';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Only allow GET for simple trigger
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Try multiple possible database URL environment variables
  const dbUrl = process.env.SUPABASE_POSTGRES_URL_NON_POOLING ||
                process.env.SUPABASE_POSTGRES_URL ||
                process.env.POSTGRES_URL ||
                process.env.DATABASE_URL;

  if (!dbUrl) {
    return res.status(500).json({
      success: false,
      error: 'No database URL found. Available env vars: ' +
        Object.keys(process.env).filter(k =>
          k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('SUPABASE')
        ).join(', ')
    });
  }

  let sql;
  try {
    // Connect to PostgreSQL directly
    sql = postgres(dbUrl, { ssl: dbUrl.includes('sslmode=disable') ? false : 'require' });

    // SQL migrations to run
    const migrations = [
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gemini-2.0-flash-exp'",
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS ai_resolution TEXT DEFAULT '2K'",
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS link_image_size TEXT DEFAULT '1:1'",
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS image_image_size TEXT DEFAULT '1:1'",
      // Auto-post config table
      `CREATE TABLE IF NOT EXISTS auto_post_config (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id TEXT NOT NULL UNIQUE,
        enabled BOOLEAN DEFAULT false,
        interval_minutes INTEGER DEFAULT 60,
        last_post_type TEXT CHECK (last_post_type IN ('text', 'image')),
        last_post_at TIMESTAMPTZ,
        next_post_at TIMESTAMPTZ,
        post_token TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      // Auto-post logs table
      `CREATE TABLE IF NOT EXISTS auto_post_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id TEXT NOT NULL,
        post_type TEXT NOT NULL,
        quote_id UUID,
        quote_text TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        facebook_post_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      // Index for scheduler queries
      "CREATE INDEX IF NOT EXISTS idx_auto_post_config_next_post ON auto_post_config(next_post_at) WHERE enabled = true",
      // Index for logs queries
      "CREATE INDEX IF NOT EXISTS idx_auto_post_logs_page ON auto_post_logs(page_id, created_at DESC)",
      // Tokens table - store Facebook tokens for 3 months
      `CREATE TABLE IF NOT EXISTS tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL UNIQUE,
        user_name TEXT,
        access_token TEXT,
        post_token TEXT,
        fb_dtsg TEXT,
        cookie TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      // Index for token lookup by user_id
      "CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id)",
      // Add page_name column to auto_post_config
      "ALTER TABLE auto_post_config ADD COLUMN IF NOT EXISTS page_name TEXT",
      // Global settings table for system-wide configurations (like API keys)
      `CREATE TABLE IF NOT EXISTS global_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key TEXT NOT NULL UNIQUE,
        setting_value TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )`,
      // Index for fast lookup by key
      "CREATE INDEX IF NOT EXISTS idx_global_settings_key ON global_settings(setting_key)",
      // Image source setting: 'ai' for Gemini AI, 'og' for OG Image Generator
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS image_source TEXT DEFAULT 'ai'",
      // OG Image Generator background URL
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS og_background_url TEXT",
      // OG Image Generator font
      "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS og_font TEXT DEFAULT 'noto-sans-thai'",
      // Earnings history table - store daily earnings for pages with auto_schedule enabled
      `CREATE TABLE IF NOT EXISTS earnings_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        page_id TEXT NOT NULL,
        page_name TEXT,
        date DATE NOT NULL,
        daily_earnings DECIMAL(12, 8) DEFAULT 0,
        weekly_earnings DECIMAL(12, 8) DEFAULT 0,
        monthly_earnings DECIMAL(12, 8) DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(page_id, date)
      )`,
      // Index for earnings queries
      "CREATE INDEX IF NOT EXISTS idx_earnings_history_page_date ON earnings_history(page_id, date DESC)"
    ];

    const results = [];

    // Execute each migration
    for (const migration of migrations) {
      try {
        await sql.unsafe(migration);
        results.push({ sql: migration.substring(0, 60) + '...', success: true });
      } catch (e: any) {
        // Column already exists is not an error
        if (e.message?.includes('already exists')) {
          results.push({ sql: migration.substring(0, 60) + '...', success: true, note: 'Already exists' });
        } else {
          results.push({ sql: migration.substring(0, 60) + '...', error: e.message });
        }
      }
    }

    // Verify columns exist
    const testResult = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'page_settings'
      AND column_name IN ('ai_model', 'ai_resolution', 'link_image_size', 'image_image_size')
    `;

    // Get current data
    const settings = await sql`SELECT * FROM page_settings ORDER BY updated_at DESC LIMIT 10`;

    await sql.end();

    return res.status(200).json({
      success: true,
      message: 'Migration completed!',
      columnsFound: testResult.map(r => r.column_name),
      migrations: results,
      rowCount: settings.length,
      data: settings
    });
  } catch (error: any) {
    if (sql) await sql.end();
    console.error('[migrate] Error:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Unknown error',
      hint: 'Make sure POSTGRES_URL or DATABASE_URL is set correctly'
    });
  }
}
