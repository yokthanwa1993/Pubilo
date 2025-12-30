import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sql = neon(process.env.DATABASE_URL!);

  try {
    const { quotes } = req.body;

    if (!quotes || !Array.isArray(quotes)) {
      return res.status(400).json({ success: false, error: 'Missing quotes array' });
    }

    // Ensure table exists
    await sql`
      CREATE TABLE IF NOT EXISTS quotes (
        id SERIAL PRIMARY KEY,
        quote_text TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Insert all quotes
    let inserted = 0;
    for (const quote of quotes) {
      if (quote.text && quote.text.trim()) {
        await sql`INSERT INTO quotes (quote_text) VALUES (${quote.text.trim()})`;
        inserted++;
      }
    }

    console.log(`[quotes-import] Imported ${inserted} quotes`);

    return res.status(200).json({
      success: true,
      imported: inserted,
    });
  } catch (error) {
    console.error('[quotes-import] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
