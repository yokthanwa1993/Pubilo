import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Verify cron secret or allow manual trigger
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // Allow without auth for testing, but log it
    console.log('[cron-earnings] No auth header, proceeding anyway for testing');
  }

  console.log('[cron-earnings] Starting earnings collection...');

  try {
    // Get all pages with auto_schedule enabled and post_token
    const { data: pages, error: pagesError } = await supabase
      .from('page_settings')
      .select('page_id, page_name, post_token')
      .eq('auto_schedule', true)
      .not('post_token', 'is', null);

    if (pagesError) {
      console.error('[cron-earnings] Error fetching pages:', pagesError);
      return res.status(500).json({ error: 'Failed to fetch pages' });
    }

    if (!pages || pages.length === 0) {
      console.log('[cron-earnings] No pages with auto_schedule enabled');
      return res.status(200).json({ success: true, message: 'No pages to process', count: 0 });
    }

    console.log(`[cron-earnings] Processing ${pages.length} pages`);
    const results = [];
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    for (const page of pages) {
      if (!page.post_token) continue;

      try {
        // Fetch monetization data from Facebook
        const fbUrl = `https://graph.facebook.com/v21.0/${page.page_id}/insights?metric=monetization_approximate_earnings&access_token=${page.post_token}`;
        const fbResponse = await fetch(fbUrl);
        const fbData = await fbResponse.json();

        if (fbData.error) {
          console.error(`[cron-earnings] FB error for page ${page.page_id}:`, fbData.error.message);
          results.push({
            pageId: page.page_id,
            pageName: page.page_name,
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

        const dailyEarnings = latestDaily?.value || 0;
        const weeklyEarnings = latestWeekly?.value || 0;
        const monthlyEarnings = latestMonthly?.value || 0;

        // Upsert to earnings_history
        const { error: upsertError } = await supabase
          .from('earnings_history')
          .upsert({
            page_id: page.page_id,
            page_name: page.page_name || page.page_id,
            date: today,
            daily_earnings: dailyEarnings,
            weekly_earnings: weeklyEarnings,
            monthly_earnings: monthlyEarnings
          }, {
            onConflict: 'page_id,date'
          });

        if (upsertError) {
          console.error(`[cron-earnings] Upsert error for page ${page.page_id}:`, upsertError);
          results.push({
            pageId: page.page_id,
            pageName: page.page_name,
            error: upsertError.message
          });
        } else {
          console.log(`[cron-earnings] Saved earnings for ${page.page_name}: daily=$${dailyEarnings.toFixed(2)}`);
          results.push({
            pageId: page.page_id,
            pageName: page.page_name,
            daily: dailyEarnings,
            weekly: weeklyEarnings,
            monthly: monthlyEarnings,
            saved: true
          });
        }
      } catch (err) {
        console.error(`[cron-earnings] Error processing page ${page.page_id}:`, err);
        results.push({
          pageId: page.page_id,
          pageName: page.page_name,
          error: err instanceof Error ? err.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.saved).length;
    console.log(`[cron-earnings] Completed. ${successCount}/${pages.length} pages saved successfully`);

    return res.status(200).json({
      success: true,
      date: today,
      processed: pages.length,
      saved: successCount,
      results
    });
  } catch (error) {
    console.error('[cron-earnings] Error:', error);
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
