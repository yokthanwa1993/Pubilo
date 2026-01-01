import { FacebookPublisher } from "./facebook";
import { GeminiGenerator } from "./gemini";
import type { Config, QueueItem } from "./types";
import { sql, getPageSettings, upsertPageSettings } from "./lib/db";

// Get scheduled posts from Facebook API (same logic as cron-auto-post)
async function getScheduledPostsFromFacebook(pageId: string, pageToken: string): Promise<number[]> {
  try {
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${pageId}/scheduled_posts?fields=scheduled_publish_time&access_token=${pageToken}`
    );
    if (!response.ok) return [];
    const data = await response.json();
    return (data.data || []).map((post: any) => parseInt(post.scheduled_publish_time));
  } catch {
    return [];
  }
}

// Find next available time slot (same logic as cron-auto-post)
function findNextAvailableTimeSlot(scheduleMinutesStr: string, scheduledTimestamps: number[]): Date {
  const scheduledMinutes = scheduleMinutesStr
    .split(',')
    .map(m => parseInt(m.trim()))
    .filter(m => !isNaN(m) && m >= 0 && m < 60)
    .sort((a, b) => a - b);

  if (scheduledMinutes.length === 0) {
    return new Date(Date.now() + 60 * 60 * 1000);
  }

  const now = new Date();
  const minTime = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutes ahead

  // Check slots for next 24 hours
  for (let hourOffset = 0; hourOffset < 24; hourOffset++) {
    for (const minute of scheduledMinutes) {
      const candidate = new Date(now);
      candidate.setUTCHours(now.getUTCHours() + hourOffset, minute, 0, 0);

      if (candidate.getTime() < minTime.getTime()) continue;

      const candidateTimestamp = Math.floor(candidate.getTime() / 1000);
      const isTaken = scheduledTimestamps.some(ts => Math.abs(ts - candidateTimestamp) < 120);

      if (!isTaken) {
        return candidate;
      }
    }
  }

  return new Date(Date.now() + 60 * 60 * 1000);
}
import { createClient } from '@supabase/supabase-js';
import { processAutoPosting } from "./auto-post";

// Supabase client for quotes
const supabase = createClient(
  Bun.env.SUPABASE_URL || Bun.env.NEXT_PUBLIC_SUPABASE_URL || "",
  Bun.env.SUPABASE_SERVICE_ROLE_KEY || ""
);

const PORT = 3000;

// Load config from environment variables (defaults only)
const defaultConfig: Config = {
  accessToken: Bun.env.ACCESS_TOKEN || "",
  cookie: Bun.env.COOKIE || "",
  adAccountId: Bun.env.AD_ACCOUNT_ID || "",
  pageId: Bun.env.PAGE_ID || "",
  defaults: {
    linkUrl: Bun.env.DEFAULT_LINK_URL || "",
    linkName: Bun.env.DEFAULT_LINK_NAME || "",
    caption: Bun.env.DEFAULT_CAPTION || "",
    description: Bun.env.DEFAULT_DESCRIPTION || "",
  },
};

const FREEIMAGE_API_KEY = Bun.env.FREEIMAGE_API_KEY || "";
const GEMINI_API_KEY = Bun.env.GEMINI_API_KEY || "";

// Queue state
let queue: QueueItem[] = [];
let autoPostInterval: ReturnType<typeof setInterval> | null = null;
let autoPostEnabled = false;
let postIntervalMinutes = 30;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;

// Stats
const stats = {
  generated: 0,
  published: 0,
  failed: 0,
};

// Upload image to freeimage.host
async function uploadToFreeImage(file: File, log: (msg: string) => void): Promise<string> {
  log("Uploading to freeimage.host...");

  if (!FREEIMAGE_API_KEY) {
    throw new Error("FREEIMAGE_API_KEY not configured in .env.local - get free key at https://freeimage.host/page/api");
  }

  const formData = new FormData();
  formData.append("key", FREEIMAGE_API_KEY);
  formData.append("action", "upload");
  formData.append("source", file);
  formData.append("format", "json");

  const response = await fetch("https://freeimage.host/api/1/upload", {
    method: "POST",
    body: formData,
  });

  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    log(`   Error response: ${text.substring(0, 200)}`);
    throw new Error("freeimage.host returned invalid response - check API key");
  }

  if (data.status_code !== 200 || !data.image?.url) {
    throw new Error(`Failed to upload image: ${data.error?.message || "Unknown error"}`);
  }

  log(`   URL: ${data.image.url}`);
  return data.image.url;
}

// MIME types
const MIME: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
};

function getMime(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME[ext] || "application/octet-stream";
}

async function serveStatic(path: string): Promise<Response> {
  const file = Bun.file(path);
  if (await file.exists()) {
    return new Response(file, {
      headers: { "Content-Type": getMime(path) },
    });
  }
  return new Response("Not Found", { status: 404 });
}

// Update auto-post next_post_at when any post is published (shared time slots)
async function updateAutoPostNextTime(pageId: string): Promise<void> {
  if (!sql || !pageId) return;

  try {
    // Get page settings and token
    const settings = await getPageSettings(pageId);
    const scheduleMinutesStr = settings?.schedule_minutes || '00, 15, 30, 45';
    
    // Get page token for Facebook API
    const tokenResult = await sql`
      SELECT post_token FROM auto_post_config WHERE page_id = ${pageId} LIMIT 1
    `;
    const pageToken = tokenResult[0]?.post_token;
    
    if (!pageToken) {
      console.log(`[auto-post] No post_token for page ${pageId}, using fallback calculation`);
      // Fallback to simple time calculation
      const nextPostAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      await sql`
        UPDATE auto_post_config
        SET next_post_at = ${nextPostAt}, updated_at = ${new Date().toISOString()}
        WHERE page_id = ${pageId}
      `;
      return;
    }

    // Get scheduled posts from Facebook (same as API)
    const scheduledTimestamps = await getScheduledPostsFromFacebook(pageId, pageToken);
    console.log(`[auto-post] Found ${scheduledTimestamps.length} scheduled posts on Facebook`);

    // Find next available time slot
    const nextAvailable = findNextAvailableTimeSlot(scheduleMinutesStr, scheduledTimestamps);
    const nextPostAt = nextAvailable.toISOString();
    const nowStr = new Date().toISOString();

    // Update auto_post_config
    await sql`
      UPDATE auto_post_config
      SET next_post_at = ${nextPostAt},
          updated_at = ${nowStr}
      WHERE page_id = ${pageId}
    `;

    console.log(`[auto-post] Updated next_post_at for page ${pageId}: ${nextPostAt}`);
  } catch (err) {
    console.error('[auto-post] Failed to update next_post_at:', err);
  }
}

async function handlePublish(req: Request): Promise<Response> {
  const body = await req.json();

  const imageUrl = body.imageUrl as string;
  const linkUrl = body.linkUrl as string;
  const linkName = body.linkName as string;
  const caption = body.caption as string;
  const description = body.description as string;
  const scheduledTime = body.scheduledTime as number | null; // Unix timestamp

  // Get tokens and cookie from request (sent by extension via frontend)
  // accessToken = Ads Token (for creating ad creative)
  // pageToken = Page Token (for publishing)
  // fbDtsg = Facebook security token (for GraphQL scheduling)
  const accessToken = body.accessToken || defaultConfig.accessToken;
  const pageToken = body.pageToken || null;  // Page Token from frontend (optional)
  const fbDtsg = body.fbDtsg || null;  // fb_dtsg for GraphQL scheduling
  const cookie = body.cookieData || body.cookie || defaultConfig.cookie;
  const adAccountId = body.adAccountId || defaultConfig.adAccountId;
  const pageId = body.pageId || defaultConfig.pageId;

  // Log token types received
  const adsTokenType = accessToken?.startsWith("EAABsbCS") ? "ADS_TOKEN" :
                       accessToken?.startsWith("EAAChZC") ? "POST_TOKEN" : "UNKNOWN";
  const pageTokenType = pageToken?.startsWith("EAAChZC") ? "FROM_POSTCRON" :
                        pageToken?.startsWith("EAABsbCS") ? "FROM_ADS" :
                        pageToken ? "UNKNOWN" : "NULL";
  console.log("[Pubilo] Received tokens:", {
    adsTokenType,
    pageTokenType,
    hasPageToken: !!pageToken,
    hasFbDtsg: !!fbDtsg,
    adsTokenPrefix: accessToken?.substring(0, 10),
    pageTokenPrefix: pageToken?.substring(0, 10),
    adAccountId: adAccountId || "(empty)",
    pageId: pageId || "(empty)",
    envAdAccountId: defaultConfig.adAccountId || "(not set)"
  });

  if (!imageUrl) {
    console.log("[Pubilo] Validation failed: No image provided");
    return Response.json({ success: false, error: "No image provided" }, { status: 400 });
  }

  if (!linkUrl || !linkName) {
    console.log("[Pubilo] Validation failed: Missing linkUrl or linkName", { linkUrl, linkName });
    return Response.json({ success: false, error: "Missing linkUrl or linkName" }, { status: 400 });
  }

  if (!accessToken) {
    console.log("[Pubilo] Validation failed: No access token");
    return Response.json({ success: false, error: "No access token. Please login via extension first." }, { status: 400 });
  }

  if (!cookie) {
    console.log("[Pubilo] Validation failed: No cookie");
    return Response.json({ success: false, error: "No cookie. Please login via extension first." }, { status: 400 });
  }

  if (!adAccountId) {
    console.log("[Pubilo] Validation failed: No ad account selected");
    return Response.json({ success: false, error: "No ad account selected" }, { status: 400 });
  }

  if (!pageId) {
    console.log("[Pubilo] Validation failed: No page selected");
    return Response.json({ success: false, error: "No page selected" }, { status: 400 });
  }

  // Use streaming response for both immediate and scheduled posts
  // scheduledTime will be passed to Facebook API for native scheduling
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const log = (msg: string) => {
        controller.enqueue(encoder.encode(msg + "\n"));
      };

      try {
        log("Starting publish process...");
        log(`Image URL type: ${imageUrl?.substring(0, 30)}...`);

        // Convert base64 data URL to File and upload to freeimage
        let finalImageUrl = imageUrl;
        if (imageUrl.startsWith("data:")) {
          const base64Data = imageUrl.split(",")[1];
          const mimeType = imageUrl.split(";")[0].split(":")[1];
          const buffer = Buffer.from(base64Data, "base64");
          const blob = new Blob([buffer], { type: mimeType });
          const file = new File([blob], "image.png", { type: mimeType });
          finalImageUrl = await uploadToFreeImage(file, log);
        }

        // Create config with the tokens and cookie from request
        // Note: We always fetch Page Token from Ads Token, not using Postcron token
        const config: Config = {
          accessToken,  // Ads Token for creating ad creative + fetching page token
          cookie,
          adAccountId: adAccountId.startsWith("act_") ? adAccountId : `act_${adAccountId}`,
          pageId,
          fbDtsg: fbDtsg || undefined,  // Required for GraphQL scheduling
          defaults: defaultConfig.defaults,
        };

        const publisher = new FacebookPublisher(config, log);

        // Pass scheduledTime to Facebook API for native scheduling
        const result = await publisher.publish({
          imageUrl: finalImageUrl,
          linkUrl,
          linkName,
          caption: caption || defaultConfig.defaults.caption,
          description: description || defaultConfig.defaults.description,
          scheduledTime: scheduledTime || undefined,
        });

        stats.published++;

        // Update auto-post next_post_at (shared time slots)
        await updateAutoPostNextTime(pageId);

        if (result.needsScheduling) {
          // Post created but needs scheduling via extension GraphQL
          log(`\n{"success":true,"needsScheduling":true,"postId":"${result.postId}","url":"${result.url}","scheduledTime":${result.scheduledTime}}`);
        } else {
          // Immediate publish completed
          log(`\n{"success":true,"url":"${result.url}"}`);
        }
      } catch (error) {
        stats.failed++;
        const msg = error instanceof Error ? error.message : "Unknown error";
        log(`\nError: ${msg}`);
        log(`\n{"success":false,"error":"${msg}"}`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}

// Generate images with Gemini
async function handleGenerate(req: Request): Promise<Response> {
  if (!GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 400 });
  }

  try {
    const body = await req.json();
    const referenceImages = body.referenceImages || [];
    const caption = body.caption || body.prompt || "";
    const customPrompt = body.customPrompt || "";
    const aspectRatio = body.aspectRatio || "1:1";
    const resolution = body.resolution || "2K";
    const numberOfImages = body.numberOfImages || 1;
    const model = body.model || "gemini-2.0-flash-exp";
    const pageName = body.pageName || "";

    console.log('[Generate] Using model:', model);
    console.log('[Generate] Received aspectRatio:', aspectRatio);
    console.log('[Generate] Received pageName:', pageName);

    // TEXT-ONLY GENERATION: If no images but caption provided
    if (referenceImages.length === 0 && caption) {
      console.log('[Generate] Text-only generation with caption:', caption.substring(0, 50) + '...');

      let textPrompt: string;
      if (customPrompt && customPrompt.trim()) {
        // Replace placeholders
        textPrompt = customPrompt
          .replace(/\{\{QUOTE\}\}/g, caption)
          .replace(/\{\{PAGE_NAME\}\}/g, pageName);

        // Convert aspect ratio to explicit dimensions for better AI understanding
        const aspectDimensions: Record<string, string> = {
          '1:1': '1024x1024 pixels (square)',
          '2:3': '1024x1536 pixels (portrait/vertical)',
          '3:2': '1536x1024 pixels (landscape/horizontal)',
          '4:5': '1024x1280 pixels (portrait)',
          '5:4': '1280x1024 pixels (landscape)',
          '9:16': '1024x1820 pixels (vertical story)',
          '16:9': '1820x1024 pixels (horizontal widescreen)',
        };
        const dimensionDesc = aspectDimensions[aspectRatio] || `${aspectRatio} ratio`;
        const isPortrait = aspectRatio.includes(':') && parseInt(aspectRatio.split(':')[0]) < parseInt(aspectRatio.split(':')[1]);
        const orientationDesc = isPortrait ? 'PORTRAIT/VERTICAL' : aspectRatio === '1:1' ? 'SQUARE' : 'LANDSCAPE/HORIZONTAL';

        // Append technical parameters automatically
        textPrompt += `\n\n**CRITICAL IMAGE DIMENSIONS (MUST FOLLOW):**
- **Aspect Ratio: ${aspectRatio}** → Generate image with ${dimensionDesc}
- This is a ${orientationDesc} image
- Resolution: ${resolution}
- สร้างแค่ 1 รูปเดียว ห้ามสร้าง grid, collage, 2x2, 4 รูปใน 1 ภาพ`;
        console.log('[Generate] Using custom prompt with aspectRatio:', aspectRatio, dimensionDesc);
      } else {
        textPrompt = `สร้างรูปภาพ 1 รูป สำหรับโพสต์ Facebook ที่มีลักษณะดังนี้:

**สำคัญมาก - ข้อห้าม:**
- ห้ามสร้างรูปแบบ grid, collage หรือหลายรูปใน 1 ภาพ
- ต้องเป็นรูปเดียวเท่านั้น ไม่ใช่ 2x2, 4 รูป หรือ split screen
- สร้างแค่ 1 scene เท่านั้น

**พื้นหลัง:**
- ภาพถ่ายธรรมชาติสวยงาม เช่น พระอาทิตย์ตก/ขึ้น ภูเขา ทะเล ท้องฟ้า หมอก ทุ่งหญ้า
- สีโทนอบอุ่น gradient จากส้มทอง เหลือง ไปฟ้าอ่อน
- ภาพต้องมีความชัด สวยงาม ดูสงบ ให้ความรู้สึกผ่อนคลาย

**ข้อความภาษาไทย:**
"${caption}"

**การจัดวางข้อความ:**
- ข้อความอยู่ตรงกลางบน-กลางรูป (ประมาณ 1/3 บนของรูป)
- ฟอนต์หนา ตัวใหญ่ อ่านง่าย
- สีข้อความเป็นสีเข้ม (ดำหรือน้ำตาลเข้ม) ให้ตัดกับพื้นหลังสีอ่อน
- มีเงาข้อความเล็กน้อยให้อ่านง่ายขึ้น
- แบ่งบรรทัดให้สวยงาม อ่านง่าย

**สไตล์โดยรวม:**
- ดูเป็นมืออาชีพ เหมาะโพสต์ Facebook
- รูปแบบ Quote/คำคม ที่นิยมใน Social Media ไทย
- ขนาดรูป: ${aspectRatio}
- จำไว้: สร้างแค่ 1 รูปเดียว ห้าม grid`;
      }

      const images = await generateTextToImage(GEMINI_API_KEY, textPrompt, numberOfImages, model);
      stats.generated += images.length;
      return Response.json({ success: true, images });
    }

    // IMAGE-BASED GENERATION
    if (referenceImages.length === 0) {
      return Response.json({ error: "No images or caption provided" }, { status: 400 });
    }

    const generator = new GeminiGenerator(GEMINI_API_KEY);
    const images = await generator.generate(referenceImages);
    stats.generated += images.length;
    return Response.json({ success: true, images });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Generate error:", msg);
    return Response.json({ error: msg }, { status: 500 });
  }
}

// Text-to-image generation using Gemini API
async function generateTextToImage(apiKey: string, prompt: string, count: number = 1, model: string = 'gemini-2.0-flash-exp'): Promise<string[]> {
  console.log('[generateTextToImage] Model:', model, 'Count:', count);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const generatePromises = Array(count).fill(null).map(() =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
      }),
    }).then(r => r.json())
  );

  const results = await Promise.allSettled(generatePromises);
  const images: string[] = [];

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const response = result.value;
      if (response.candidates?.[0]?.content?.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData?.data) {
            const mimeType = part.inlineData.mimeType || 'image/png';
            images.push(`data:${mimeType};base64,${part.inlineData.data}`);
          }
        }
      }
    } else {
      console.error('[generateTextToImage] Request failed:', result.reason);
    }
  }

  if (images.length === 0) {
    throw new Error('No image generated from text prompt');
  }

  return images;
}

// Queue management
function processNextInQueue() {
  if (queue.length === 0 || !autoPostEnabled) return;

  const item = queue.find((i) => i.status === "pending");
  if (!item) return;

  item.status = "processing";

  // Async publish
  (async () => {
    try {
      // First upload to freeimage if it's a data URL
      let imageUrl = item.imageUrl;
      if (imageUrl.startsWith("data:")) {
        const base64Data = imageUrl.split(",")[1];
        const mimeType = imageUrl.split(";")[0].split(":")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        const file = new File([blob], "image.png", { type: mimeType });
        imageUrl = await uploadToFreeImage(file, console.log);
      }

      const publisher = new FacebookPublisher(defaultConfig, console.log);
      const result = await publisher.publish({
        imageUrl,
        linkUrl: item.linkUrl,
        linkName: item.linkName,
        caption: item.caption || defaultConfig.defaults.caption,
        description: item.description || defaultConfig.defaults.description,
      });

      item.status = "done";
      item.postUrl = result.url;
      stats.published++;
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : "Unknown error";
      stats.failed++;
    }
  })();
}

function startAutoPost() {
  if (autoPostInterval) {
    clearInterval(autoPostInterval);
  }
  autoPostEnabled = true;
  autoPostInterval = setInterval(processNextInQueue, postIntervalMinutes * 60 * 1000);
  // Process immediately
  processNextInQueue();
}

function stopAutoPost() {
  autoPostEnabled = false;
  if (autoPostInterval) {
    clearInterval(autoPostInterval);
    autoPostInterval = null;
  }
}

// Process scheduled posts when their time comes
async function processScheduledPosts() {
  const now = Math.floor(Date.now() / 1000);
  const dueItems = queue.filter(
    (item) => item.status === "pending" && item.scheduledTime && item.scheduledTime <= now
  );

  for (const item of dueItems) {
    console.log(`[Pubilo] Processing scheduled post ${item.id}...`);
    item.status = "processing";

    try {
      // Upload image if it's a data URL
      let imageUrl = item.imageUrl;
      if (imageUrl.startsWith("data:")) {
        const base64Data = imageUrl.split(",")[1];
        const mimeType = imageUrl.split(";")[0].split(":")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        const file = new File([blob], "image.png", { type: mimeType });
        imageUrl = await uploadToFreeImage(file, console.log);
      }

      // Create config for this item
      const config: Config = {
        accessToken: item.accessToken || defaultConfig.accessToken,
        pageToken: item.pageToken,
        cookie: item.cookie || defaultConfig.cookie,
        adAccountId: item.adAccountId || defaultConfig.adAccountId,
        pageId: item.pageId || defaultConfig.pageId,
        defaults: defaultConfig.defaults,
      };

      const publisher = new FacebookPublisher(config, console.log);
      const result = await publisher.publish({
        imageUrl,
        linkUrl: item.linkUrl,
        linkName: item.linkName,
        caption: item.caption || defaultConfig.defaults.caption,
        description: item.description || defaultConfig.defaults.description,
      });

      item.status = "done";
      item.postUrl = result.url;
      stats.published++;
      console.log(`[Pubilo] Scheduled post ${item.id} published: ${result.url}`);
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : "Unknown error";
      stats.failed++;
      console.error(`[Pubilo] Scheduled post ${item.id} failed:`, item.error);
    }
  }
}

// Start scheduler (check every 30 seconds)
function startScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  schedulerInterval = setInterval(async () => {
    await processScheduledPosts();
    await processAutoPosting();
  }, 30 * 1000);
  console.log("[Pubilo] Scheduler started (including auto-posting)");
}

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // CORS headers for all requests
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (path === "/api/config" && req.method === "GET") {
      return Response.json({
        defaults: defaultConfig.defaults,
        hasToken: !!defaultConfig.accessToken,
        pageId: defaultConfig.pageId,
        adAccountId: defaultConfig.adAccountId,
      }, { headers: corsHeaders });
    }

    if (path === "/api/publish" && req.method === "POST") {
      const response = await handlePublish(req);
      // Add CORS headers
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Generate images endpoint
    if (path === "/api/generate" && req.method === "POST") {
      const response = await handleGenerate(req);
      response.headers.set("Access-Control-Allow-Origin", "*");
      return response;
    }

    // Upload image endpoint (base64 to freeimage.host)
    if (path === "/api/upload-image" && req.method === "POST") {
      try {
        const body = await req.json();
        const { imageData } = body;

        if (!imageData) {
          return Response.json({ success: false, error: "No image data provided" }, { status: 400, headers: corsHeaders });
        }

        // If already a URL (not base64), return as-is
        if (!imageData.startsWith("data:")) {
          return Response.json({ success: true, url: imageData }, { headers: corsHeaders });
        }

        // Upload base64 to freeimage.host
        if (!FREEIMAGE_API_KEY) {
          return Response.json({ success: false, error: "FREEIMAGE_API_KEY not configured" }, { status: 500, headers: corsHeaders });
        }

        const base64Content = imageData.replace(/^data:image\/\w+;base64,/, "");
        const formData = new FormData();
        formData.append("key", FREEIMAGE_API_KEY);
        formData.append("source", base64Content);
        formData.append("format", "json");

        const response = await fetch("https://freeimage.host/api/1/upload", {
          method: "POST",
          body: formData,
        });

        const text = await response.text();
        let data;
        try {
          data = JSON.parse(text);
        } catch {
          return Response.json({ success: false, error: `Failed to parse response: ${text.substring(0, 100)}` }, { status: 500, headers: corsHeaders });
        }

        if (!data.image?.url) {
          return Response.json({ success: false, error: data.error?.message || "Upload failed" }, { status: 500, headers: corsHeaders });
        }

        console.log("[upload-image] Uploaded:", data.image.url);
        return Response.json({ success: true, url: data.image.url }, { headers: corsHeaders });

      } catch (error) {
        console.error("[upload-image] Error:", error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: corsHeaders });
      }
    }

    // Stats endpoint
    if (path === "/api/stats" && req.method === "GET") {
      return Response.json({
        ...stats,
        queued: queue.filter((i) => i.status === "pending").length,
      }, { headers: corsHeaders });
    }

    // Queue endpoints
    if (path === "/api/queue" && req.method === "GET") {
      return Response.json({
        items: queue,
        autoPostEnabled,
        intervalMinutes: postIntervalMinutes,
      }, { headers: corsHeaders });
    }

    if (path === "/api/queue" && req.method === "POST") {
      const body = await req.json();
      const item: QueueItem = {
        id: Date.now().toString(),
        imageUrl: body.imageUrl,
        linkUrl: body.linkUrl || defaultConfig.defaults.linkUrl,
        linkName: body.linkName || defaultConfig.defaults.linkName,
        caption: body.caption || defaultConfig.defaults.caption,
        description: body.description || defaultConfig.defaults.description,
        status: "pending",
        createdAt: new Date().toISOString(),
      };
      queue.push(item);
      return Response.json({ success: true, item }, { headers: corsHeaders });
    }

    if (path === "/api/queue/start" && req.method === "POST") {
      const body = await req.json();
      if (body.intervalMinutes) {
        postIntervalMinutes = body.intervalMinutes;
      }
      startAutoPost();
      return Response.json({ success: true, autoPostEnabled: true }, { headers: corsHeaders });
    }

    if (path === "/api/queue/stop" && req.method === "POST") {
      stopAutoPost();
      return Response.json({ success: true, autoPostEnabled: false }, { headers: corsHeaders });
    }

    if (path.startsWith("/api/queue/") && req.method === "DELETE") {
      const id = path.split("/").pop();
      queue = queue.filter((i) => i.id !== id);
      return Response.json({ success: true }, { headers: corsHeaders });
    }

    // Fetch scheduled posts from Facebook API
    if (path === "/api/scheduled-posts" && req.method === "POST") {
      try {
        const body = await req.json();
        const { pageId, pageToken } = body;

        console.log("[Pubilo] Fetching scheduled posts:", {
          pageId: pageId || "(empty)",
          hasToken: !!pageToken,
          tokenPrefix: pageToken?.substring(0, 15) + "..."
        });

        if (!pageId || !pageToken) {
          return Response.json(
            { success: false, error: "Missing pageId or pageToken" },
            { status: 400, headers: corsHeaders }
          );
        }

        // Fetch scheduled posts from Facebook Graph API
        const fbUrl = `https://graph.facebook.com/v21.0/${pageId}/scheduled_posts?fields=id,message,scheduled_publish_time,full_picture,permalink_url,attachments{media}&access_token=${pageToken}`;
        console.log("[Pubilo] Facebook API URL:", fbUrl.replace(pageToken, "TOKEN_HIDDEN"));

        const fbResponse = await fetch(fbUrl);
        const fbData = await fbResponse.json();

        console.log("[Pubilo] Facebook API response:", JSON.stringify(fbData, null, 2).substring(0, 500));

        if (fbData.error) {
          console.error("[Pubilo] Facebook API error:", fbData.error);
          return Response.json(
            { success: false, error: fbData.error.message },
            { status: 400, headers: corsHeaders }
          );
        }

        // Transform Facebook data to match our format
        const scheduledPosts = (fbData.data || []).map((post: any) => ({
          id: post.id,
          message: post.message || "",
          scheduledTime: post.scheduled_publish_time,
          imageUrl: post.full_picture || post.attachments?.data?.[0]?.media?.image?.src || "",
          permalink: post.permalink_url || "",
        }));

        return Response.json(
          { success: true, posts: scheduledPosts },
          { headers: corsHeaders }
        );
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error("[Pubilo] Scheduled posts fetch error:", msg);
        return Response.json(
          { success: false, error: msg },
          { status: 500, headers: corsHeaders }
        );
      }
    }

    // Page settings - GET
    if (path === "/api/page-settings" && req.method === "GET") {
      try {
        const pageId = url.searchParams.get("pageId");
        if (!pageId) {
          return Response.json({ success: false, error: "Missing pageId" }, { status: 400, headers: corsHeaders });
        }

        // Auto-create table if not exists
        await sql`
          CREATE TABLE IF NOT EXISTS page_settings (
            page_id TEXT PRIMARY KEY,
            auto_schedule BOOLEAN DEFAULT false,
            schedule_minutes TEXT DEFAULT '00, 15, 30, 45',
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `;

        const settings = await getPageSettings(pageId);
        return Response.json({
          success: true,
          settings: settings || {
            page_id: pageId,
            auto_schedule: false,
            schedule_minutes: "00, 15, 30, 45",
          },
        }, { headers: corsHeaders });
      } catch (error) {
        console.error("[page-settings] GET error:", error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: corsHeaders });
      }
    }

    // Page settings - POST
    if (path === "/api/page-settings" && req.method === "POST") {
      try {
        const body = await req.json();
        const { pageId, autoSchedule, scheduleMinutes, aiModel, aiResolution, linkImageSize, imageImageSize } = body;
        if (!pageId) {
          return Response.json({ success: false, error: "Missing pageId" }, { status: 400, headers: corsHeaders });
        }

        const result = await upsertPageSettings(
          pageId,
          autoSchedule === true || autoSchedule === "true",
          scheduleMinutes || "00, 15, 30, 45",
          aiModel,
          aiResolution,
          linkImageSize,
          imageImageSize
        );
        console.log("[page-settings] Saved:", { pageId, autoSchedule, scheduleMinutes, aiModel, aiResolution });
        return Response.json({ success: true, settings: result[0] }, { headers: corsHeaders });
      } catch (error) {
        console.error("[page-settings] POST error:", error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: corsHeaders });
      }
    }

    // Migrate - create tables
    if (path === "/api/migrate" && req.method === "GET") {
      try {
        const results: { sql: string; success: boolean; error?: string }[] = [];

        // Page settings table
        await sql`
          CREATE TABLE IF NOT EXISTS page_settings (
            page_id TEXT PRIMARY KEY,
            auto_schedule BOOLEAN DEFAULT false,
            schedule_minutes TEXT DEFAULT '00, 15, 30, 45',
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `;
        results.push({ sql: "page_settings table", success: true });

        // Add new columns to page_settings if they don't exist
        const columnMigrations = [
          "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS ai_model TEXT DEFAULT 'gemini-2.0-flash-exp'",
          "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS ai_resolution TEXT DEFAULT '2K'",
          "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS link_image_size TEXT DEFAULT '1:1'",
          "ALTER TABLE page_settings ADD COLUMN IF NOT EXISTS image_image_size TEXT DEFAULT '1:1'"
        ];
        for (const m of columnMigrations) {
          try {
            await sql.unsafe(m);
            results.push({ sql: m.substring(0, 50) + "...", success: true });
          } catch (e: any) {
            if (!e.message?.includes('already exists')) {
              results.push({ sql: m.substring(0, 50) + "...", success: false, error: e.message });
            }
          }
        }

        // Auto-post config table
        await sql`
          CREATE TABLE IF NOT EXISTS auto_post_config (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            page_id TEXT NOT NULL UNIQUE,
            enabled BOOLEAN DEFAULT false,
            interval_minutes INTEGER DEFAULT 60,
            last_post_type TEXT CHECK (last_post_type IN ('text', 'image')),
            last_post_at TIMESTAMPTZ,
            next_post_at TIMESTAMPTZ,
            post_token TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          )
        `;
        results.push({ sql: "auto_post_config table", success: true });

        // Auto-post logs table
        await sql`
          CREATE TABLE IF NOT EXISTS auto_post_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            page_id TEXT NOT NULL,
            post_type TEXT NOT NULL,
            quote_id UUID,
            quote_text TEXT,
            status TEXT NOT NULL,
            error_message TEXT,
            facebook_post_id TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
          )
        `;
        results.push({ sql: "auto_post_logs table", success: true });

        // Create indexes
        try {
          await sql`CREATE INDEX IF NOT EXISTS idx_auto_post_config_next_post ON auto_post_config(next_post_at) WHERE enabled = true`;
          results.push({ sql: "idx_auto_post_config_next_post", success: true });
        } catch (e) {}
        try {
          await sql`CREATE INDEX IF NOT EXISTS idx_auto_post_logs_page ON auto_post_logs(page_id, created_at DESC)`;
          results.push({ sql: "idx_auto_post_logs_page", success: true });
        } catch (e) {}

        console.log("[migrate] All tables created/verified");
        return Response.json({
          success: true,
          message: "Migration completed!",
          migrations: results,
        }, { headers: corsHeaders });
      } catch (error) {
        console.error("[migrate] Error:", error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: corsHeaders });
      }
    }

    // Quotes API - GET
    if (path === "/api/quotes" && req.method === "GET") {
      try {
        const limit = parseInt(url.searchParams.get("limit") || "50");
        const offset = parseInt(url.searchParams.get("offset") || "0");
        const pageId = url.searchParams.get("pageId") || "";

        const { count } = await supabase
          .from('quotes')
          .select('*', { count: 'exact', head: true });

        const { data: quotes, error } = await supabase
          .from('quotes')
          .select('id, quote_text, created_at, used_by_pages')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        const quotesWithUsage = (quotes || []).map(q => ({
          ...q,
          isUsed: pageId ? (q.used_by_pages || []).includes(pageId) : false
        }));

        return Response.json({
          success: true,
          quotes: quotesWithUsage,
          total: count || 0,
          hasMore: offset + (quotes?.length || 0) < (count || 0),
        }, { headers: corsHeaders });
      } catch (error) {
        console.error('[quotes] GET error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Quotes API - POST (add new quote)
    if (path === "/api/quotes" && req.method === "POST") {
      try {
        const body = await req.json();
        const { quoteText } = body;

        if (!quoteText || quoteText.trim().length === 0) {
          return Response.json({ success: false, error: 'Missing quote text' }, { status: 400, headers: corsHeaders });
        }

        const { data, error } = await supabase
          .from('quotes')
          .insert({ quote_text: quoteText.trim() })
          .select()
          .single();

        if (error) throw error;

        return Response.json({ success: true, quote: data }, { headers: corsHeaders });
      } catch (error) {
        console.error('[quotes] POST error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Quotes API - PATCH (mark as used)
    if (path === "/api/quotes" && req.method === "PATCH") {
      try {
        const body = await req.json();
        const { id, pageId } = body;

        if (!id || !pageId) {
          return Response.json({ success: false, error: 'Missing id or pageId' }, { status: 400, headers: corsHeaders });
        }

        const { data: quote, error: fetchError } = await supabase
          .from('quotes')
          .select('used_by_pages')
          .eq('id', id)
          .single();

        if (fetchError) throw fetchError;

        let usedByPages: string[] = quote?.used_by_pages || [];
        if (!usedByPages.includes(pageId)) {
          usedByPages = [...usedByPages, pageId];
        }

        const { data, error } = await supabase
          .from('quotes')
          .update({ used_by_pages: usedByPages })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return Response.json({ success: true, quote: data }, { headers: corsHeaders });
      } catch (error) {
        console.error('[quotes] PATCH error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Prompts API - GET
    if (path === "/api/prompts" && req.method === "GET") {
      try {
        const pageId = url.searchParams.get("pageId") || "";
        const promptType = url.searchParams.get("promptType");

        let query = supabase
          .from('prompts')
          .select('*')
          .eq('page_id', pageId);

        // Only filter by promptType if specified
        if (promptType) {
          query = query.eq('prompt_type', promptType);
        }

        const { data: prompts, error } = await query;

        if (error) throw error;

        return Response.json({ success: true, prompts: prompts || [] }, { headers: corsHeaders });
      } catch (error) {
        console.error('[prompts] GET error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Prompts API - POST (upsert)
    if (path === "/api/prompts" && req.method === "POST") {
      try {
        const body = await req.json();
        const { pageId, promptType, promptText } = body;

        if (!pageId || !promptType) {
          return Response.json({ success: false, error: "Missing pageId or promptType" }, { status: 400, headers: corsHeaders });
        }

        // Upsert: update if exists, insert if not
        const { data, error } = await supabase
          .from('prompts')
          .upsert({
            page_id: pageId,
            prompt_type: promptType,
            prompt_text: promptText || "",
            updated_at: new Date().toISOString(),
          }, { onConflict: 'page_id,prompt_type' })
          .select();

        if (error) throw error;

        console.log('[prompts] Saved:', { pageId, promptType, promptText: promptText?.substring(0, 50) });
        return Response.json({ success: true, prompt: data?.[0] }, { headers: corsHeaders });
      } catch (error) {
        console.error('[prompts] POST error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Auto-post config - GET (using postgres directly)
    if (path === "/api/auto-post-config" && req.method === "GET") {
      try {
        const pageId = url.searchParams.get("pageId");
        if (!pageId) {
          return Response.json({ success: false, error: "Missing pageId" }, { status: 400, headers: corsHeaders });
        }

        if (!sql) {
          return Response.json({ success: false, error: "Database not configured" }, { status: 500, headers: corsHeaders });
        }

        const result = await sql`
          SELECT * FROM auto_post_config WHERE page_id = ${pageId} LIMIT 1
        `;

        // Return default config if none exists
        if (!result || result.length === 0) {
          return Response.json({
            success: true,
            config: {
              page_id: pageId,
              enabled: false,
              interval_minutes: 60,
              last_post_type: null,
              last_post_at: null,
              next_post_at: null,
              post_token: null,
            }
          }, { headers: corsHeaders });
        }

        return Response.json({ success: true, config: result[0] }, { headers: corsHeaders });
      } catch (error) {
        console.error('[auto-post-config] GET error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Auto-post config - POST (using postgres directly)
    if (path === "/api/auto-post-config" && req.method === "POST") {
      try {
        const body = await req.json();
        const { pageId, enabled, postToken } = body;

        if (!pageId) {
          return Response.json({ success: false, error: "Missing pageId" }, { status: 400, headers: corsHeaders });
        }

        if (!sql) {
          return Response.json({ success: false, error: "Database not configured" }, { status: 500, headers: corsHeaders });
        }

        // Get interval from page_settings (shared with Auto Schedule Posts)
        const settings = await getPageSettings(pageId);
        const intervalMins = settings?.schedule_minutes ? parseInt(settings.schedule_minutes) : 60;

        // Calculate next_post_at if enabling
        let nextPostAt: string | null = null;
        if (enabled) {
          nextPostAt = new Date(Date.now() + intervalMins * 60 * 1000).toISOString();
        }

        const nowStr = new Date().toISOString();
        const isEnabled = enabled ?? false;

        // Upsert using postgres
        const result = await sql`
          INSERT INTO auto_post_config (page_id, enabled, interval_minutes, next_post_at, post_token, updated_at)
          VALUES (${pageId}, ${isEnabled}, ${intervalMins}, ${nextPostAt}, ${postToken || null}, ${nowStr})
          ON CONFLICT (page_id) DO UPDATE SET
            enabled = ${isEnabled},
            interval_minutes = ${intervalMins},
            next_post_at = ${nextPostAt},
            post_token = COALESCE(${postToken || null}, auto_post_config.post_token),
            updated_at = ${nowStr}
          RETURNING *
        `;

        console.log('[auto-post-config] Saved:', { pageId, enabled, intervalMins });
        return Response.json({ success: true, config: result[0] }, { headers: corsHeaders });
      } catch (error) {
        console.error('[auto-post-config] POST error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Auto-post logs - GET (using postgres directly)
    if (path === "/api/auto-post-logs" && req.method === "GET") {
      try {
        const pageId = url.searchParams.get("pageId");
        const limitNum = parseInt(url.searchParams.get("limit") || "10");

        if (!pageId) {
          return Response.json({ success: false, error: "Missing pageId" }, { status: 400, headers: corsHeaders });
        }

        if (!sql) {
          return Response.json({ success: false, error: "Database not configured" }, { status: 500, headers: corsHeaders });
        }

        const result = await sql`
          SELECT * FROM auto_post_logs
          WHERE page_id = ${pageId}
          ORDER BY created_at DESC
          LIMIT ${limitNum}
        `;

        return Response.json({ success: true, logs: result || [] }, { headers: corsHeaders });
      } catch (error) {
        console.error('[auto-post-logs] GET error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Tokens - GET (fetch tokens from tokens table by userId)
    if (path === "/api/tokens" && req.method === "GET") {
      try {
        const userId = url.searchParams.get("userId");
        if (!userId) {
          return Response.json({ success: false, error: "Missing userId" }, { status: 400, headers: corsHeaders });
        }

        if (!sql) {
          return Response.json({ success: false, error: "Database not configured" }, { status: 500, headers: corsHeaders });
        }

        // Get tokens from tokens table
        const result = await sql`
          SELECT * FROM tokens WHERE user_id = ${userId} LIMIT 1
        `;

        if (result.length === 0) {
          return Response.json({ success: true, tokens: null }, { headers: corsHeaders });
        }

        const token = result[0];
        console.log('[tokens] GET for user', userId, '- found token, updated:', token.updated_at);
        return Response.json({
          success: true,
          tokens: {
            userId: token.user_id,
            userName: token.user_name,
            accessToken: token.access_token,
            postToken: token.post_token,
            fbDtsg: token.fb_dtsg,
            cookie: token.cookie,
            updatedAt: token.updated_at
          }
        }, { headers: corsHeaders });
      } catch (error) {
        console.error('[tokens] GET error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    // Tokens - POST (save tokens to database + fetch pages)
    if (path === "/api/tokens" && req.method === "POST") {
      try {
        const body = await req.json();
        const { userId, userName, accessToken, postToken, fbDtsg, cookie } = body;

        if (!userId) {
          return Response.json({ success: false, error: "Missing userId" }, { status: 400, headers: corsHeaders });
        }

        if (!sql) {
          return Response.json({ success: false, error: "Database not configured" }, { status: 500, headers: corsHeaders });
        }

        const nowStr = new Date().toISOString();

        // Upsert tokens
        const result = await sql`
          INSERT INTO tokens (user_id, user_name, access_token, post_token, fb_dtsg, cookie, updated_at)
          VALUES (${userId}, ${userName || null}, ${accessToken || null}, ${postToken || null}, ${fbDtsg || null}, ${cookie || null}, ${nowStr})
          ON CONFLICT (user_id) DO UPDATE SET
            user_name = COALESCE(${userName || null}, tokens.user_name),
            access_token = COALESCE(${accessToken || null}, tokens.access_token),
            post_token = COALESCE(${postToken || null}, tokens.post_token),
            fb_dtsg = COALESCE(${fbDtsg || null}, tokens.fb_dtsg),
            cookie = COALESCE(${cookie || null}, tokens.cookie),
            updated_at = ${nowStr}
          RETURNING *
        `;

        console.log('[tokens] Saved for user', userId, '- has accessToken:', !!accessToken, 'postToken:', !!postToken);

        // If we have postToken, fetch pages and store their tokens
        // (postToken has pages_show_list permission, accessToken is for Ads only)
        let pagesUpdated = 0;
        if (postToken) {
          try {
            const pagesResponse = await fetch(
              `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,access_token&access_token=${postToken}`
            );
            const pagesData = await pagesResponse.json();

            if (pagesData.data && Array.isArray(pagesData.data)) {
              for (const page of pagesData.data) {
                // Upsert page token into auto_post_config
                await sql`
                  INSERT INTO auto_post_config (page_id, post_token, updated_at)
                  VALUES (${page.id}, ${page.access_token}, ${nowStr})
                  ON CONFLICT (page_id) DO UPDATE SET
                    post_token = ${page.access_token},
                    updated_at = ${nowStr}
                `;
                pagesUpdated++;
                console.log('[tokens] Stored page token for', page.name, '(', page.id, ')');
              }
            }
          } catch (pageError) {
            console.error('[tokens] Error fetching pages:', pageError);
          }
        }

        return Response.json({ success: true, token: result[0], pagesUpdated }, { headers: corsHeaders });
      } catch (error) {
        console.error('[tokens] POST error:', error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500, headers: corsHeaders });
      }
    }

    if (path === "/") {
      return serveStatic("./public/index.html");
    }

    return serveStatic(`./public${path}`);
  },
});

// Start the scheduler for processing scheduled posts
startScheduler();

console.log(`
  Pubilo v3.0

  http://localhost:${server.port}

  Features:
  - Auto-schedule posts (configure in Settings)
  - Scheduler checks every 30 seconds

  Usage:
  1. Open FewFeed V2 (https://v2.fewfeed.com) and login
  2. Click the extension icon
  3. Token will be loaded automatically
  4. Start publishing!
`);
