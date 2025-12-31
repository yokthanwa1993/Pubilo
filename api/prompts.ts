import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Prompt {
  id?: number;
  page_id: string;
  prompt_type: 'link_post' | 'image_post';
  prompt_text: string;
  created_at?: string;
  updated_at?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Get prompts for a page
  if (req.method === 'GET') {
    try {
      const { pageId, promptType } = req.query;

      if (!pageId || typeof pageId !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      let query = supabase
        .from('prompts')
        .select('*')
        .eq('page_id', pageId);

      if (promptType) {
        query = query.eq('prompt_type', promptType);
      }

      const { data, error } = await query;

      if (error) {
        // Table might not exist
        if (error.code === 'PGRST205' || error.code === '42P01') {
          return res.status(200).json({
            success: true,
            prompts: [],
            message: 'Prompts table not found - run /api/prompts?action=init first'
          });
        }
        throw error;
      }

      return res.status(200).json({
        success: true,
        prompts: data || [],
      });
    } catch (error) {
      console.error('[prompts] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // POST - Create or update prompt (upsert)
  if (req.method === 'POST') {
    try {
      const { pageId, promptType, promptText, action } = req.body;

      // Special action: initialize table
      if (action === 'init') {
        // Try creating via raw SQL through Supabase RPC or just attempt insert
        console.log('[prompts] Table init requested');
        return res.status(200).json({
          success: true,
          message: 'Please create the prompts table in Supabase dashboard with: id (int8), page_id (text), prompt_type (text), prompt_text (text), created_at (timestamptz), updated_at (timestamptz)'
        });
      }

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      if (!promptType || !['link_post', 'image_post'].includes(promptType)) {
        return res.status(400).json({ success: false, error: 'Invalid promptType (must be link_post or image_post)' });
      }

      if (!promptText) {
        return res.status(400).json({ success: false, error: 'Missing promptText' });
      }

      const prompt: Prompt = {
        page_id: pageId,
        prompt_type: promptType,
        prompt_text: promptText,
        updated_at: new Date().toISOString(),
      };

      // Check if exists
      const { data: existing } = await supabase
        .from('prompts')
        .select('id')
        .eq('page_id', pageId)
        .eq('prompt_type', promptType)
        .single();

      let data, error;

      if (existing) {
        // Update
        ({ data, error } = await supabase
          .from('prompts')
          .update({ prompt_text: promptText, updated_at: new Date().toISOString() })
          .eq('id', existing.id)
          .select()
          .single());
      } else {
        // Insert
        ({ data, error } = await supabase
          .from('prompts')
          .insert(prompt)
          .select()
          .single());
      }

      if (error) throw error;

      console.log('[prompts] Saved:', { pageId, promptType, id: data?.id });

      return res.status(200).json({
        success: true,
        prompt: data,
      });
    } catch (error) {
      console.error('[prompts] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // DELETE - Remove a prompt
  if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ success: false, error: 'Missing prompt id' });
      }

      const { error } = await supabase
        .from('prompts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('[prompts] DELETE error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
