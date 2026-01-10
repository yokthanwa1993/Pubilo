import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Load config
  if (req.method === 'GET') {
    const { pageId } = req.query;
    if (!pageId) {
      return res.status(400).json({ success: false, error: 'Missing pageId' });
    }

    const { data, error } = await supabase
      .from('auto_hide_config')
      .select('*')
      .eq('page_id', pageId)
      .single();

    return res.status(200).json({
      success: true,
      config: data || { page_id: pageId, enabled: false }
    });
  }

  // POST - Save config
  if (req.method === 'POST') {
    const { pageId, enabled, postToken, hideTypes } = req.body;
    if (!pageId) {
      return res.status(400).json({ success: false, error: 'Missing pageId' });
    }

    const updateData: any = {
      page_id: pageId,
      enabled: enabled === true,
      updated_at: new Date().toISOString()
    };
    if (postToken !== undefined) updateData.post_token = postToken || null;
    if (hideTypes !== undefined) updateData.hide_types = hideTypes;

    const { data, error } = await supabase
      .from('auto_hide_config')
      .upsert(updateData, { onConflict: 'page_id' })
      .select()
      .single();

    if (error) {
      return res.status(500).json({ success: false, error: error.message });
    }

    return res.status(200).json({ success: true, config: data });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
