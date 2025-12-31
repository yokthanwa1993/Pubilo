import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - List quotes with pagination
  if (req.method === 'GET') {
    try {
      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const pageId = req.query.pageId as string; // Optional: filter context for showing used status

      // Get total count
      const { count } = await supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true });

      // Get paginated quotes including used_by_pages
      const { data: quotes, error } = await supabase
        .from('quotes')
        .select('id, quote_text, created_at, used_by_pages')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      // Add isUsed flag if pageId is provided
      const quotesWithUsage = (quotes || []).map(q => ({
        ...q,
        isUsed: pageId ? (q.used_by_pages || []).includes(pageId) : false
      }));

      return res.status(200).json({
        success: true,
        quotes: quotesWithUsage,
        total: count || 0,
        hasMore: offset + (quotes?.length || 0) < (count || 0),
      });
    } catch (error) {
      console.error('[quotes] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // POST - Add new quote
  if (req.method === 'POST') {
    try {
      const { quoteText, quotes } = req.body;

      // Bulk import
      if (quotes && Array.isArray(quotes)) {
        let inserted = 0;
        for (const quote of quotes) {
          const text = quote.text || quote.quoteText;
          if (text && text.trim()) {
            const { error } = await supabase
              .from('quotes')
              .insert({ quote_text: text.trim() });
            if (!error) inserted++;
          }
        }
        return res.status(200).json({ success: true, imported: inserted });
      }

      // Single quote
      if (!quoteText || quoteText.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Missing quote text' });
      }

      const { data, error } = await supabase
        .from('quotes')
        .insert({ quote_text: quoteText.trim() })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ success: true, quote: data });
    } catch (error) {
      console.error('[quotes] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // PUT - Update quote text
  if (req.method === 'PUT') {
    try {
      const { id, quoteText } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing quote id' });
      }

      if (!quoteText || quoteText.trim().length === 0) {
        return res.status(400).json({ success: false, error: 'Missing quote text' });
      }

      const { data, error } = await supabase
        .from('quotes')
        .update({ quote_text: quoteText.trim() })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ success: true, quote: data });
    } catch (error) {
      console.error('[quotes] PUT error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // PATCH - Mark quote as used by a page
  if (req.method === 'PATCH') {
    try {
      const { id, pageId, action } = req.body;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing quote id' });
      }

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      // Get current used_by_pages
      const { data: quote, error: fetchError } = await supabase
        .from('quotes')
        .select('used_by_pages')
        .eq('id', id)
        .single();

      if (fetchError) throw fetchError;

      let usedByPages: string[] = quote?.used_by_pages || [];

      if (action === 'unmark') {
        // Remove pageId from the array
        usedByPages = usedByPages.filter((p: string) => p !== pageId);
      } else {
        // Add pageId if not already present (default action: mark as used)
        if (!usedByPages.includes(pageId)) {
          usedByPages = [...usedByPages, pageId];
        }
      }

      // Update the quote
      const { data, error } = await supabase
        .from('quotes')
        .update({ used_by_pages: usedByPages })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        quote: data,
        isUsed: usedByPages.includes(pageId)
      });
    } catch (error) {
      console.error('[quotes] PATCH error:', error);
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

      const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ success: true });
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
