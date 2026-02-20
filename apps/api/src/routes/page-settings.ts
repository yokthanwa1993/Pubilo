import { Hono } from 'hono';
import { Env } from '../index';

const app = new Hono<{ Bindings: Env }>();

// GET /api/page-settings?pageId=xxx
app.get('/', async (c) => {
    const pageId = c.req.query('pageId');
    if (!pageId) return c.json({ success: false, error: 'Missing pageId' }, 400);

    try {
        const result = await c.env.DB.prepare(`
            SELECT * FROM page_settings WHERE page_id = ?
        `).bind(pageId).first();

        const defaultSettings = {
            page_id: pageId,
            auto_schedule: 0,
            schedule_minutes: '00, 15, 30, 45',
            ai_model: 'gemini-2.0-flash-exp',
            ai_resolution: '2K',
            link_image_size: '1:1',
            image_image_size: '1:1',
            working_hours_start: 6,
            working_hours_end: 24,
        };

        return c.json({
            success: true,
            settings: result || defaultSettings,
        });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// POST /api/page-settings
app.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const { pageId } = body;
        if (!pageId) return c.json({ success: false, error: 'Missing pageId' }, 400);

        const now = new Date().toISOString();

        // Build update fields
        const fields: Record<string, any> = {
            page_id: pageId,
            updated_at: now,
        };

        if (body.autoSchedule !== undefined) fields.auto_schedule = body.autoSchedule ? 1 : 0;
        if (body.scheduleMinutes !== undefined) fields.schedule_minutes = body.scheduleMinutes;
        if (body.workingHoursStart !== undefined) fields.working_hours_start = body.workingHoursStart;
        if (body.workingHoursEnd !== undefined) fields.working_hours_end = body.workingHoursEnd;
        if (body.aiModel !== undefined) fields.ai_model = body.aiModel;
        if (body.aiResolution !== undefined) fields.ai_resolution = body.aiResolution;
        if (body.linkImageSize !== undefined) fields.link_image_size = body.linkImageSize;
        if (body.imageImageSize !== undefined) fields.image_image_size = body.imageImageSize;
        if (body.postToken !== undefined) fields.post_token = body.postToken || null;
        if (body.hideToken !== undefined) fields.hide_token = body.hideToken || null;
        if (body.postMode !== undefined) fields.post_mode = body.postMode;
        if (body.colorBg !== undefined) fields.color_bg = body.colorBg ? 1 : 0;
        if (body.colorBgPresets !== undefined) fields.color_bg_presets = body.colorBgPresets;
        if (body.colorBgIndex !== undefined) fields.color_bg_index = body.colorBgIndex;
        if (body.sharePageId !== undefined) fields.share_page_id = body.sharePageId;
        if (body.shareMode !== undefined) fields.share_mode = body.shareMode;
        if (body.shareScheduleMinutes !== undefined) fields.share_schedule_minutes = body.shareScheduleMinutes;
        if (body.pageColor !== undefined) fields.page_color = body.pageColor;
        if (body.pageName !== undefined) fields.page_name = body.pageName;
        if (body.pictureUrl !== undefined) fields.picture_url = body.pictureUrl;
        if (body.imageSource !== undefined) fields.image_source = body.imageSource;
        if (body.ogBackgroundUrl !== undefined) fields.og_background_url = body.ogBackgroundUrl;
        if (body.ogFont !== undefined) fields.og_font = body.ogFont;
        if (body.newsAnalysisPrompt !== undefined) fields.news_analysis_prompt = body.newsAnalysisPrompt;
        if (body.newsGenerationPrompt !== undefined) fields.news_generation_prompt = body.newsGenerationPrompt;
        if (body.newsImageSize !== undefined) fields.news_image_size = body.newsImageSize;
        if (body.newsVariationCount !== undefined) fields.news_variation_count = body.newsVariationCount;
        if (body.hideTypes !== undefined) fields.hide_types = body.hideTypes;

        const columns = Object.keys(fields);
        const placeholders = columns.map(() => '?').join(', ');
        const updateClauses = columns.filter(c => c !== 'page_id').map(c => `${c} = excluded.${c}`).join(', ');

        await c.env.DB.prepare(`
            INSERT INTO page_settings (${columns.join(', ')})
            VALUES (${placeholders})
            ON CONFLICT(page_id) DO UPDATE SET ${updateClauses}
        `).bind(...Object.values(fields)).run();

        const result = await c.env.DB.prepare(`
            SELECT * FROM page_settings WHERE page_id = ?
        `).bind(pageId).first();

        return c.json({ success: true, settings: result });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

// DELETE /api/page-settings?pageId=xxx
app.delete('/', async (c) => {
    const pageId = c.req.query('pageId');
    if (!pageId) return c.json({ success: false, error: 'Missing pageId' }, 400);

    try {
        await c.env.DB.prepare(`
            DELETE FROM page_settings WHERE page_id = ?
        `).bind(pageId).run();

        return c.json({ success: true, deleted: pageId });
    } catch (error) {
        return c.json({ success: false, error: String(error) }, 500);
    }
});

export { app as pageSettingsRouter };
