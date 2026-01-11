import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { pageId } = req.query;

    // Get all pages with tokens if no specific pageId
    const { data: pages, error: pagesError } = await supabase
      .from('page_settings')
      .select('page_id, page_name, post_token')
      .not('post_token', 'is', null);

    if (pagesError) {
      console.error('[earnings] Error fetching pages:', pagesError);
      return res.status(500).json({ error: 'Failed to fetch pages' });
    }

    // Filter to specific page if requested
    const targetPages = pageId
      ? pages?.filter(p => p.page_id === pageId)
      : pages;

    if (!targetPages || targetPages.length === 0) {
      return res.status(200).json({ success: true, earnings: [] });
    }

    const earnings = [];

    for (const page of targetPages) {
      if (!page.post_token) continue;

      try {
        // Fetch monetization data from Facebook
        const fbUrl = `https://graph.facebook.com/v21.0/${page.page_id}/insights?metric=monetization_approximate_earnings&access_token=${page.post_token}`;
        const fbResponse = await fetch(fbUrl);
        const fbData = await fbResponse.json();

        if (fbData.error) {
          console.error(`[earnings] FB error for page ${page.page_id}:`, fbData.error.message);
          earnings.push({
            pageId: page.page_id,
            pageName: page.page_name || page.page_id,
            error: fbData.error.message
          });
          continue;
        }

        // Parse earnings data
        const dailyData = fbData.data?.find((d: any) => d.period === 'day');
        const weeklyData = fbData.data?.find((d: any) => d.period === 'week');
        const monthlyData = fbData.data?.find((d: any) => d.period === 'days_28');

        const latestDaily = dailyData?.values?.[dailyData.values.length - 1];
        const latestWeekly = weeklyData?.values?.[weeklyData.values.length - 1];
        const latestMonthly = monthlyData?.values?.[monthlyData.values.length - 1];

        earnings.push({
          pageId: page.page_id,
          pageName: page.page_name || page.page_id,
          daily: latestDaily?.value || 0,
          dailyDate: latestDaily?.end_time,
          weekly: latestWeekly?.value || 0,
          weeklyDate: latestWeekly?.end_time,
          monthly: latestMonthly?.value || 0,
          monthlyDate: latestMonthly?.end_time,
        });
      } catch (err) {
        console.error(`[earnings] Error fetching page ${page.page_id}:`, err);
        earnings.push({
          pageId: page.page_id,
          pageName: page.page_name || page.page_id,
          error: 'Failed to fetch earnings'
        });
      }
    }

    return res.status(200).json({
      success: true,
      earnings
    });
  } catch (error) {
    console.error('[earnings] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
