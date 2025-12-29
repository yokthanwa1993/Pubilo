import { FacebookPublisher } from "./facebook";
import { GeminiGenerator } from "./gemini";
import type { Config, QueueItem } from "./types";
import { sql, getPageSettings, upsertPageSettings } from "./lib/db";

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
    // Accept JSON with base64 images
    const body = await req.json();
    const referenceImages = body.referenceImages;

    if (!referenceImages || referenceImages.length === 0) {
      return Response.json({ error: "No images provided" }, { status: 400 });
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
  schedulerInterval = setInterval(processScheduledPosts, 30 * 1000);
  console.log("[Pubilo] Scheduler started");
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
        const { pageId, autoSchedule, scheduleMinutes } = body;
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

        const result = await upsertPageSettings(
          pageId,
          autoSchedule === true || autoSchedule === "true",
          scheduleMinutes || "00, 15, 30, 45"
        );
        console.log("[page-settings] Saved:", { pageId, autoSchedule, scheduleMinutes });
        return Response.json({ success: true, settings: result[0] }, { headers: corsHeaders });
      } catch (error) {
        console.error("[page-settings] POST error:", error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: corsHeaders });
      }
    }

    // Migrate - create page_settings table
    if (path === "/api/migrate" && req.method === "GET") {
      try {
        await sql`
          CREATE TABLE IF NOT EXISTS page_settings (
            page_id TEXT PRIMARY KEY,
            auto_schedule BOOLEAN DEFAULT false,
            schedule_minutes TEXT DEFAULT '00, 15, 30, 45',
            updated_at TIMESTAMP DEFAULT NOW()
          )
        `;
        console.log("[migrate] page_settings table created/verified");
        const settings = await sql`SELECT * FROM page_settings ORDER BY updated_at DESC`;
        return Response.json({
          success: true,
          message: "Migration completed: page_settings table created",
          table: "page_settings",
          rowCount: settings.length,
          data: settings,
        }, { headers: corsHeaders });
      } catch (error) {
        console.error("[migrate] Error:", error);
        return Response.json({ success: false, error: error instanceof Error ? error.message : "Unknown error" }, { status: 500, headers: corsHeaders });
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
