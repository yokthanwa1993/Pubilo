import type { VercelRequest, VercelResponse } from '@vercel/node';
import { neon } from '@neondatabase/serverless';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).setHeader('Access-Control-Allow-Origin', '*').end();
  }

  const sql = neon(process.env.DATABASE_URL!);

  // Ensure table exists
  await sql`
    CREATE TABLE IF NOT EXISTS quotes (
      id SERIAL PRIMARY KEY,
      quote_text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )
  `;

  // GET - List quotes with pagination
  if (req.method === 'GET') {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;

      // Get total count
      const countResult = await sql`SELECT COUNT(*) as total FROM quotes`;
      const total = parseInt(countResult[0].total);

      // Get paginated quotes
      const quotes = await sql`SELECT * FROM quotes ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

      return res.status(200).json({
        success: true,
        quotes,
        total,
        hasMore: offset + quotes.length < total,
      });
    } catch (error) {
      console.error('[quotes] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // POST - Add new quote (single or bulk)
  if (req.method === 'POST') {
    try {
      const { quoteText, quotes } = req.body;

      // Bulk import
      if (quotes && Array.isArray(quotes)) {
        let inserted = 0;
        for (const quote of quotes) {
          const text = quote.text || quote.quoteText;
          if (text && text.trim()) {
            await sql`INSERT INTO quotes (quote_text) VALUES (${text.trim()})`;
            inserted++;
          }
        }
        console.log(`[quotes] Bulk imported ${inserted} quotes`);
        return res.status(200).json({
          success: true,
          imported: inserted,
        });
      }

      // Single quote
      if (!quoteText || quoteText.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Missing quote text' });
      }

      const result = await sql`
        INSERT INTO quotes (quote_text)
        VALUES (${quoteText.trim()})
        RETURNING *
      `;

      console.log('[quotes] Added:', result[0]);

      return res.status(200).json({
        success: true,
        quote: result[0],
      });
    } catch (error) {
      console.error('[quotes] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // DELETE - Remove quote by id
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing quote id' });
      }

      await sql`DELETE FROM quotes WHERE id = ${id}`;

      console.log('[quotes] Deleted:', id);

      return res.status(200).json({
        success: true,
      });
    } catch (error) {
      console.error('[quotes] DELETE error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
