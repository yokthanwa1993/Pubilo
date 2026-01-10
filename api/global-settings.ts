import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // GET - Retrieve a global setting
  if (req.method === 'GET') {
    const { key } = req.query;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing key parameter' });
    }

    try {
      const { data, error } = await supabase
        .from('global_settings')
        .select('setting_value')
        .eq('setting_key', key)
        .single();

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows found
        throw error;
      }

      return res.status(200).json({
        success: true,
        key,
        value: data?.setting_value || null
      });
    } catch (error: any) {
      console.error('[global-settings] GET error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST - Save a global setting
  if (req.method === 'POST') {
    const { key, value } = req.body;

    if (!key || typeof key !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing key parameter' });
    }

    try {
      const { data, error } = await supabase
        .from('global_settings')
        .upsert({
          setting_key: key,
          setting_value: value || null,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'setting_key'
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({
        success: true,
        message: 'Setting saved successfully',
        data
      });
    } catch (error: any) {
      console.error('[global-settings] POST error:', error);
      return res.status(500).json({ success: false, error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
