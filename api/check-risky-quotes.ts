import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Facebook Community Standards - Only truly risky/explicit content
const riskyPatterns: { pattern: RegExp; category: string }[] = [
  // Explicit sexual content (Thai) - Very risky words
  { pattern: /เย็ด/gi, category: 'sexual-explicit' },
  { pattern: /หี/gi, category: 'sexual-explicit' },
  { pattern: /ควย/gi, category: 'sexual-explicit' },
  { pattern: /เงี่ยน/gi, category: 'sexual-explicit' },
  { pattern: /ร่วมเพศ/gi, category: 'sexual-explicit' },
  { pattern: /โป๊/gi, category: 'sexual-explicit' },
  { pattern: /xxx/gi, category: 'sexual-explicit' },
  { pattern: /กะหรี่/gi, category: 'sexual-explicit' },
  { pattern: /โสเภณี/gi, category: 'sexual-explicit' },
  { pattern: /ขายตัว/gi, category: 'sexual-explicit' },
  { pattern: /อมนก/gi, category: 'sexual-explicit' },
  { pattern: /โม๊ก/gi, category: 'sexual-explicit' },
  { pattern: /จู๋/gi, category: 'sexual-explicit' },
  { pattern: /จิ๋ม/gi, category: 'sexual-explicit' },
  { pattern: /ข่มขืน/gi, category: 'sexual-explicit' },
  { pattern: /ปล้ำ/gi, category: 'sexual-explicit' },
  { pattern: /อวัยวะเพศ/gi, category: 'sexual-explicit' },
  { pattern: /เปลือย/gi, category: 'sexual-explicit' },
  { pattern: /แก้ผ้า/gi, category: 'sexual-explicit' },

  // Explicit sexual content (English)
  { pattern: /\bporn/gi, category: 'sexual-explicit' },
  { pattern: /\bnude/gi, category: 'sexual-explicit' },
  { pattern: /\bnaked/gi, category: 'sexual-explicit' },
  { pattern: /\bxxx\b/gi, category: 'sexual-explicit' },
  { pattern: /fuck/gi, category: 'sexual-explicit' },
  { pattern: /\bdick\b/gi, category: 'sexual-explicit' },
  { pattern: /\bcock\b/gi, category: 'sexual-explicit' },
  { pattern: /\bpussy\b/gi, category: 'sexual-explicit' },
  { pattern: /\borgasm/gi, category: 'sexual-explicit' },
  { pattern: /\bhentai/gi, category: 'sexual-explicit' },

  // Self-harm / Suicide
  { pattern: /ฆ่าตัวตาย/gi, category: 'self-harm' },
  { pattern: /กรีดข้อมือ/gi, category: 'self-harm' },
  { pattern: /แขวนคอ/gi, category: 'self-harm' },

  // Extreme hate speech / Slurs
  { pattern: /ไอ้เหี้ย/gi, category: 'hate' },
  { pattern: /ไอ้หน้าหี/gi, category: 'hate' },
  { pattern: /ไอ้หน้าควย/gi, category: 'hate' },

  // Hard drugs
  { pattern: /ยาบ้า/gi, category: 'drugs' },
  { pattern: /เฮโรอีน/gi, category: 'drugs' },
  { pattern: /โคเคน/gi, category: 'drugs' },
  { pattern: /ยาไอซ์/gi, category: 'drugs' },
];

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action as string;

  console.log('[check-risky] Starting scan...');

  // Fetch all quotes
  let allQuotes: any[] = [];
  let from = 0;
  const batchSize = 1000;

  while (true) {
    const { data: batch, error } = await supabase
      .from('quotes')
      .select('id, quote_text')
      .range(from, from + batchSize - 1);

    if (error) {
      console.error('Error:', error);
      return res.status(500).json({ error: error.message });
    }
    if (!batch || batch.length === 0) break;

    allQuotes = allQuotes.concat(batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  console.log(`[check-risky] Total quotes: ${allQuotes.length}`);

  // Check for risky content
  const riskyQuotes: any[] = [];

  for (const quote of allQuotes) {
    const text = quote.quote_text || '';

    for (const { pattern, category } of riskyPatterns) {
      pattern.lastIndex = 0; // Reset regex
      const match = text.match(pattern);
      if (match) {
        riskyQuotes.push({
          id: quote.id,
          text: text,
          category,
          matched: match[0]
        });
        break;
      }
    }
  }

  console.log(`[check-risky] Found ${riskyQuotes.length} risky quotes`);

  // If action=delete, delete the risky quotes
  if (action === 'delete' && riskyQuotes.length > 0) {
    const ids = riskyQuotes.map(q => q.id);
    const { error: deleteError } = await supabase
      .from('quotes')
      .delete()
      .in('id', ids);

    if (deleteError) {
      return res.status(500).json({ error: deleteError.message });
    }

    console.log(`[check-risky] Deleted ${ids.length} quotes`);

    return res.status(200).json({
      success: true,
      action: 'deleted',
      totalScanned: allQuotes.length,
      deletedCount: riskyQuotes.length,
      deletedQuotes: riskyQuotes
    });
  }

  // Just return the risky quotes for review
  return res.status(200).json({
    success: true,
    action: 'scan',
    totalScanned: allQuotes.length,
    riskyCount: riskyQuotes.length,
    riskyQuotes
  });
}
