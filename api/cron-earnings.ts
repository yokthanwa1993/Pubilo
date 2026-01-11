import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
const LINE_USER_ID = process.env.LINE_USER_ID || ''; // Your LINE user ID for push messages

async function sendLineEarningsSummary(results: any[], date: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN || !LINE_USER_ID) {
    console.log('[cron-earnings] LINE credentials not configured, skipping notification');
    return;
  }

  // Filter successful results
  const successResults = results.filter(r => r.saved && !r.error);
  if (successResults.length === 0) return;

  // Calculate totals
  const totalDaily = successResults.reduce((sum, r) => sum + (r.daily || 0), 0);
  const totalWeekly = successResults.reduce((sum, r) => sum + (r.weekly || 0), 0);
  const totalMonthly = successResults.reduce((sum, r) => sum + (r.monthly || 0), 0);

  // Format date for display
  const displayDate = new Date().toLocaleDateString('th-TH', {
    day: '2-digit', month: '2-digit', year: '2-digit',
    hour: '2-digit', minute: '2-digit'
  });

  // Page colors for visual distinction
  const pageColors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a'];

  // Build page earnings rows with beautiful cards
  const pageContents = successResults.map((r, idx) => ({
    type: 'box',
    layout: 'horizontal',
    contents: [
      {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: '●', size: 'xs', color: pageColors[idx % pageColors.length] }
        ],
        width: '20px',
        alignItems: 'center',
        justifyContent: 'center'
      },
      {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: r.pageName || r.pageId, size: 'sm', color: '#333333', weight: 'bold' }
        ],
        flex: 4
      },
      {
        type: 'box',
        layout: 'vertical',
        contents: [
          { type: 'text', text: `$${(r.daily || 0).toFixed(2)}`, size: 'md', color: pageColors[idx % pageColors.length], weight: 'bold', align: 'end' }
        ],
        flex: 3
      }
    ],
    backgroundColor: '#F8F9FA',
    paddingAll: 'md',
    cornerRadius: 'lg',
    margin: 'sm'
  }));

  const flexMessage = {
    type: 'flex',
    altText: `💰 รายได้วันนี้: $${totalDaily.toFixed(2)}`,
    contents: {
      type: 'bubble',
      size: 'mega',
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          // Minimal header
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: '💰 Earnings', size: 'md', color: '#333333', weight: 'bold', flex: 1 },
              { type: 'text', text: displayDate, size: 'xs', color: '#999999', align: 'end', gravity: 'center' }
            ],
            paddingBottom: 'lg'
          },
          // Daily - Large centered card
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: 'TODAY', size: 'xs', color: '#666666', align: 'center' },
              { type: 'text', text: `$${totalDaily.toFixed(2)}`, size: 'xxl', weight: 'bold', color: '#1DB954', align: 'center' }
            ],
            backgroundColor: '#E8F5E9',
            paddingAll: 'lg',
            cornerRadius: 'lg'
          },
          // Weekly + Monthly row
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: 'WEEKLY', size: 'xxs', color: '#666666', align: 'center' },
                  { type: 'text', text: `$${totalWeekly.toFixed(2)}`, size: 'lg', weight: 'bold', color: '#2196F3', align: 'center' }
                ],
                flex: 1,
                backgroundColor: '#E3F2FD',
                paddingAll: 'md',
                cornerRadius: 'md'
              },
              { type: 'box', layout: 'vertical', contents: [], width: '8px' },
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '28-DAY', size: 'xxs', color: '#666666', align: 'center' },
                  { type: 'text', text: `$${totalMonthly.toFixed(2)}`, size: 'lg', weight: 'bold', color: '#FF5722', align: 'center' }
                ],
                flex: 1,
                backgroundColor: '#FBE9E7',
                paddingAll: 'md',
                cornerRadius: 'md'
              }
            ],
            margin: 'md',
            paddingBottom: 'lg'
          },
          // Separator
          { type: 'separator', color: '#EEEEEE' },
          // Page list header
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'แยกตามเพจ', size: 'xs', color: '#999999' }
            ],
            paddingTop: 'lg',
            paddingBottom: 'md'
          },
          // Page earnings list
          ...pageContents
        ],
        paddingAll: 'lg',
        backgroundColor: '#ffffff'
      }
    }
  };

  try {
    const response = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: LINE_USER_ID,
        messages: [flexMessage],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[cron-earnings] LINE push failed:', errorText);
    } else {
      console.log('[cron-earnings] LINE notification sent successfully');
    }
  } catch (err) {
    console.error('[cron-earnings] LINE push error:', err);
  }
}

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

    // Send LINE notification
    await sendLineEarningsSummary(results, today);

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
