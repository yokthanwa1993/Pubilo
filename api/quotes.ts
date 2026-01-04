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
      const pageId = req.query.pageId as string;
      const filter = req.query.filter as string || 'all'; // 'unused', 'used', or 'all'

      // Get all quotes to calculate counts (need to fetch all, Supabase default limit is 1000)
      let allQuotes: any[] = [];
      let from = 0;
      const batchSize = 1000;
      
      while (true) {
        const { data: batch, error: batchError } = await supabase
          .from('quotes')
          .select('id, used_by_pages, created_at')
          .range(from, from + batchSize - 1);
        
        if (batchError) throw batchError;
        if (!batch || batch.length === 0) break;
        
        allQuotes = allQuotes.concat(batch);
        if (batch.length < batchSize) break;
        from += batchSize;
      }

      // Calculate counts - GLOBAL mode
      // "ยังไม่ใช้" = quotes that NO page has used yet
      // "ใช้แล้ว" = quotes used by THIS page (or any page if no pageId)
      let unusedCount = 0;
      let usedCount = 0;
      
      (allQuotes || []).forEach(q => {
        const usedByPages = q.used_by_pages || [];
        if (usedByPages.length === 0) {
          unusedCount++;
        } else if (pageId) {
          if (usedByPages.includes(pageId)) {
            usedCount++;
          }
        } else {
          // No pageId - count all used quotes
          usedCount++;
        }
      });

      // Filter all quotes first, then paginate
      let allFiltered = (allQuotes || []).map(q => ({
        ...q,
        isUsed: (q.used_by_pages || []).length > 0,
        isUsedByThisPage: pageId ? (q.used_by_pages || []).includes(pageId) : false
      }));

      // Apply filter
      // "unused" = quotes NOT used by ANY page (global)
      // "used" = quotes used by THIS page only
      if (filter === 'unused') {
        allFiltered = allFiltered.filter(q => !q.isUsed);
      } else if (filter === 'used') {
        allFiltered = allFiltered.filter(q => q.isUsedByThisPage);
      }

      // Sort - newest first (new quotes on top)
      allFiltered.sort((a, b) => {
        const dateA = new Date(a.created_at).getTime();
        const dateB = new Date(b.created_at).getTime();
        return dateB - dateA;
      });

      // Paginate
      const paginatedQuotes = allFiltered.slice(offset, offset + limit);

      // Get full quote data for paginated results
      const quoteIds = paginatedQuotes.map(q => q.id);
      const { data: fullQuotes, error } = await supabase
        .from('quotes')
        .select('id, quote_text, created_at, used_by_pages')
        .in('id', quoteIds);

      if (error) throw error;

      // Merge and maintain order
      const quotesMap = new Map((fullQuotes || []).map(q => [q.id, q]));
      const finalQuotes = paginatedQuotes.map(q => ({
        ...quotesMap.get(q.id),
        isUsed: q.isUsed
      })).filter(q => q.id);

      const total = filter === 'used' ? usedCount : unusedCount;

      return res.status(200).json({
        success: true,
        quotes: finalQuotes,
        total,
        hasMore: offset + finalQuotes.length < allFiltered.length,
        unusedCount,
        usedCount,
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
