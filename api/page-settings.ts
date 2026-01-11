import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface PageSettings {
  page_id: string;
  auto_schedule: boolean;
  schedule_minutes: string;
  working_hours_start: number;
  working_hours_end: number;
  ai_model: string;
  ai_resolution: string;
  link_image_size: string;
  image_image_size: string;
  updated_at?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // GET - Load settings for a page
  if (req.method === 'GET') {
    try {
      const { pageId } = req.query;

      if (!pageId || typeof pageId !== 'string') {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const { data, error } = await supabase
        .from('page_settings')
        .select('*')
        .eq('page_id', pageId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('[page-settings] GET error:', error);
      }

      return res.status(200).json({
        success: true,
        settings: data || {
          page_id: pageId,
          auto_schedule: false,
          schedule_minutes: '00, 15, 30, 45',
          ai_model: 'gemini-2.0-flash-exp',
          ai_resolution: '2K',
          link_image_size: '1:1',
          image_image_size: '1:1',
        },
      });
    } catch (error) {
      console.error('[page-settings] GET error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // POST - Save settings for a page
  if (req.method === 'POST') {
    try {
      const {
        pageId,
        autoSchedule,
        scheduleMinutes,
        workingHoursStart,
        workingHoursEnd,
        aiModel,
        aiResolution,
        linkImageSize,
        imageImageSize
      } = req.body;

      if (!pageId) {
        return res.status(400).json({ success: false, error: 'Missing pageId' });
      }

      const autoScheduleBool = autoSchedule === true || autoSchedule === 'true';
      const mins = scheduleMinutes ?? '00, 15, 30, 45';

      // Only update fields that were provided
      const updateFields: any = {
        page_id: pageId,
        updated_at: new Date().toISOString(),
      };
      
      if (autoSchedule !== undefined) updateFields.auto_schedule = autoScheduleBool;
      if (scheduleMinutes !== undefined) updateFields.schedule_minutes = mins;
      if (workingHoursStart !== undefined) updateFields.working_hours_start = workingHoursStart;
      if (workingHoursEnd !== undefined) updateFields.working_hours_end = workingHoursEnd;
      if (aiModel !== undefined) updateFields.ai_model = aiModel;
      if (aiResolution !== undefined) updateFields.ai_resolution = aiResolution;
      if (linkImageSize !== undefined) updateFields.link_image_size = linkImageSize;
      if (imageImageSize !== undefined) updateFields.image_image_size = imageImageSize;
      if (req.body.newsAnalysisPrompt !== undefined) updateFields.news_analysis_prompt = req.body.newsAnalysisPrompt;
      if (req.body.newsGenerationPrompt !== undefined) updateFields.news_generation_prompt = req.body.newsGenerationPrompt;
      if (req.body.newsImageSize !== undefined) updateFields.news_image_size = req.body.newsImageSize;
      if (req.body.newsVariationCount !== undefined) updateFields.news_variation_count = req.body.newsVariationCount;
      if (req.body.shareScheduleMinutes !== undefined) updateFields.share_schedule_minutes = req.body.shareScheduleMinutes;
      if (req.body.postMode !== undefined) updateFields.post_mode = req.body.postMode;
      if (req.body.colorBg !== undefined) updateFields.color_bg = req.body.colorBg;
      if (req.body.sharePageId !== undefined) updateFields.share_page_id = req.body.sharePageId;
      if (req.body.colorBgPresets !== undefined) updateFields.color_bg_presets = req.body.colorBgPresets;
      if (req.body.colorBgIndex !== undefined) updateFields.color_bg_index = req.body.colorBgIndex;
      if (req.body.shareMode !== undefined) updateFields.share_mode = req.body.shareMode;
      if (req.body.pageColor !== undefined) updateFields.page_color = req.body.pageColor;
      if (req.body.pageName !== undefined) updateFields.page_name = req.body.pageName;
      if (req.body.postToken !== undefined) updateFields.post_token = req.body.postToken;
      if (req.body.hideTypes !== undefined) updateFields.hide_types = req.body.hideTypes;
      if (req.body.imageSource !== undefined) updateFields.image_source = req.body.imageSource;
      if (req.body.ogBackgroundUrl !== undefined) updateFields.og_background_url = req.body.ogBackgroundUrl;

      const { data, error } = await supabase
        .from('page_settings')
        .upsert(updateFields, { onConflict: 'page_id' })
        .select()
        .single();

      if (error) {
        console.error('[page-settings] POST error:', error);
        return res.status(500).json({ success: false, error: error.message });
      }

      console.log('[page-settings] Saved:', data);

      return res.status(200).json({
        success: true,
        settings: data,
      });
    } catch (error) {
      console.error('[page-settings] POST error:', error);
      return res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
