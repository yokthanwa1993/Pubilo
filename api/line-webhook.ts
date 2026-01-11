import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const LINE_CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || '';
const LINE_CHANNEL_ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';

function verifySignature(body: string, signature: string): boolean {
  if (!LINE_CHANNEL_SECRET) return true; // Skip if not configured
  const hash = crypto.createHmac('sha256', LINE_CHANNEL_SECRET).update(body).digest('base64');
  return hash === signature;
}

async function replyMessage(replyToken: string, text: string) {
  if (!LINE_CHANNEL_ACCESS_TOKEN) return;
  
  const now = new Date();
  const timeStr = now.toLocaleDateString('th-TH', { day: '2-digit', month: '2-digit', year: '2-digit' }) + ' ' + 
                  now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  
  const flexMessage = {
    type: 'flex',
    altText: 'เพิ่มคำคมสำเร็จ',
    contents: {
      type: 'bubble',
      header: {
        type: 'box',
        layout: 'vertical',
        contents: [{ type: 'text', text: 'QUOTE', weight: 'bold', size: 'xl', color: '#ffffff', align: 'center' }],
        backgroundColor: '#27AE60'
      },
      body: {
        type: 'box',
        layout: 'vertical',
        contents: [
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: '📊 สถานะ:', size: 'md', color: '#555555', flex: 2 },
              { type: 'text', text: 'สำเร็จ ✅', size: 'md', color: '#27AE60', flex: 3, weight: 'bold' }
            ],
            margin: 'md'
          },
          {
            type: 'box',
            layout: 'vertical',
            contents: [
              { type: 'text', text: '📝 ข้อความที่ได้รับ:', size: 'md', color: '#555555' },
              {
                type: 'box',
                layout: 'vertical',
                contents: [{ type: 'text', text: text, size: 'md', color: '#333333', wrap: true }],
                backgroundColor: '#F5F5F5',
                paddingAll: 'md',
                cornerRadius: 'md',
                margin: 'sm'
              }
            ],
            margin: 'xl'
          },
          {
            type: 'box',
            layout: 'baseline',
            contents: [
              { type: 'text', text: '🕐 เวลา:', size: 'md', color: '#555555', flex: 2 },
              { type: 'text', text: timeStr, size: 'md', color: '#333333', flex: 3 }
            ],
            margin: 'xl'
          }
        ]
      }
    }
  };

  await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LINE_CHANNEL_ACCESS_TOKEN}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [flexMessage],
    }),
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  console.log('[line-webhook] === REQUEST START ===', req.method);

  try {
    if (req.method === 'GET') {
      return res.status(200).send('LINE Webhook OK');
    }

    if (req.method !== 'POST') {
      return res.status(405).end();
    }

    const signature = req.headers['x-line-signature'] as string;
    const bodyStr = JSON.stringify(req.body);

    console.log('[line-webhook] Body length:', bodyStr.length);
    console.log('[line-webhook] Received:', bodyStr.substring(0, 800));

  if (!verifySignature(bodyStr, signature)) {
    console.log('[line-webhook] Invalid signature');
    return res.status(401).end();
  }

  const { events } = req.body;

  for (const event of events || []) {
    console.log('[line-webhook] Event type:', event.type, 'Message type:', event.message?.type);

    if (event.type !== 'message') continue;

    // Handle stickers - reply that we don't support them
    if (event.message.type === 'sticker') {
      console.log('[line-webhook] Sticker received, skipping');
      try {
        await replyMessage(event.replyToken, '⚠️ ไม่รองรับ Sticker กรุณาส่งเป็นข้อความ');
      } catch (e) {
        console.error('[line-webhook] Failed to reply sticker message');
      }
      continue;
    }

    // Only process text messages
    if (event.message.type !== 'text') {
      console.log('[line-webhook] Non-text message type:', event.message.type);
      continue;
    }

    let text = event.message.text || '';
    console.log('[line-webhook] Raw text:', JSON.stringify(text));
    console.log('[line-webhook] Text bytes:', Buffer.from(text).toString('hex').substring(0, 100));

    // Handle LINE emoji - they appear as placeholders in text
    if (event.message.emojis && Array.isArray(event.message.emojis)) {
      console.log('[line-webhook] LINE emojis found:', JSON.stringify(event.message.emojis));
    }

    text = text.trim();
    console.log('[line-webhook] After trim, length:', text.length);
    if (!text) {
      console.log('[line-webhook] Empty text after trim, skipping');
      continue;
    }

    try {
      console.log('[line-webhook] Inserting to DB, text bytes:', Buffer.from(text).length);
      const { data, error } = await supabase.from('quotes').insert({ quote_text: text }).select();

      if (error) {
        console.error('[line-webhook] DB Error:', JSON.stringify(error));
        throw error;
      }

      console.log('[line-webhook] DB insert success:', JSON.stringify(data));
      console.log('[line-webhook] Sending reply...');
      await replyMessage(event.replyToken, text);
      console.log('[line-webhook] Reply sent successfully');
    } catch (err) {
      console.error('[line-webhook] Error:', err instanceof Error ? err.message : JSON.stringify(err));
      console.error('[line-webhook] Error stack:', err instanceof Error ? err.stack : 'N/A');
      // ลองตอบกลับแม้ insert ไม่สำเร็จ
      try {
        await replyMessage(event.replyToken, '❌ เกิดข้อผิดพลาด: ' + (err instanceof Error ? err.message : 'Unknown'));
      } catch (replyErr) {
        console.error('[line-webhook] Reply error also failed:', replyErr instanceof Error ? replyErr.message : JSON.stringify(replyErr));
      }
    }
  }

    return res.status(200).end();
  } catch (globalErr) {
    console.error('[line-webhook] === GLOBAL ERROR ===', globalErr instanceof Error ? globalErr.message : JSON.stringify(globalErr));
    console.error('[line-webhook] Stack:', globalErr instanceof Error ? globalErr.stack : 'N/A');
    return res.status(500).json({ error: 'Internal error' });
  }
}
