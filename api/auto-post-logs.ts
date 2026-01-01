import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface AutoPostLog {
  id: string;
  page_id: string;
  post_type: 'text' | 'image';
  quote_id: string | null;
  quote_text: string | null;
  status: 'pending' | 'success' | 'failed';
  error_message: string | null;
  facebook_post_id: string | null;
  created_at: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Fetch logs for a page
  if (req.method === 'GET') {
    try {
      const pageId = req.query.pageId as string;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const { data, error } = await supabase
        .from('auto_post_logs')
        .select('*')
        .eq('page_id', pageId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      return res.status(200).json({ success: true, logs: data || [] });
    } catch (error) {
      console.error('[auto-post-logs] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // DELETE - Delete a log entry
  if (req.method === 'DELETE') {
    try {
      const logId = req.query.id as string;

      if (!logId) {
        return res.status(400).json({ success: false, error: 'Missing id' });
      }

      const { error } = await supabase
        .from('auto_post_logs')
        .delete()
        .eq('id', logId);

      if (error) throw error;

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[auto-post-logs] DELETE error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
