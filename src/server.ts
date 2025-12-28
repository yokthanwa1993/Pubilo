import { FacebookPublisher } from "./facebook";
import { GeminiGenerator } from "./gemini";
import type { Config, QueueItem } from "./types";

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

  const formData = new FormData();
  formData.append("key", FREEIMAGE_API_KEY);
  formData.append("action", "upload");
  formData.append("source", file);
  formData.append("format", "json");

  const response = await fetch("https://freeimage.host/api/1/upload", {
    method: "POST",
    body: formData,
  });

  const data = await response.json();

  if (data.status_code !== 200 || !data.image?.url) {
    throw new Error("Failed to upload image");
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
  console.log("[FEWFEED Server] Received tokens:", {
    adsTokenType,
    pageTokenType,
    hasPageToken: !!pageToken,
    hasFbDtsg: !!fbDtsg,
    adsTokenPrefix: accessToken?.substring(0, 10),
    pageTokenPrefix: pageToken?.substring(0, 10)
  });

  if (!imageUrl) {
    return Response.json({ error: "No image provided" }, { status: 400 });
  }

  if (!linkUrl || !linkName) {
    return Response.json({ error: "Missing linkUrl or linkName" }, { status: 400 });
  }

  if (!accessToken) {
    return Response.json({ error: "No access token. Please login via extension first." }, { status: 400 });
  }

  if (!cookie) {
    return Response.json({ error: "No cookie. Please login via extension first." }, { status: 400 });
  }

  if (!adAccountId) {
    return Response.json({ error: "No ad account selected" }, { status: 400 });
  }

  if (!pageId) {
    return Response.json({ error: "No page selected" }, { status: 400 });
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

        // Both immediate and scheduled posts are handled by REST API now
        stats.published++;
        if (scheduledTime) {
          log(`\n{"success":true,"scheduled":true,"url":"${result.url}"}`);
        } else {
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
    console.log(`[FEWFEED Server] Processing scheduled post ${item.id}...`);
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
      console.log(`[FEWFEED Server] Scheduled post ${item.id} published: ${result.url}`);
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : "Unknown error";
      stats.failed++;
      console.error(`[FEWFEED Server] Scheduled post ${item.id} failed:`, item.error);
    }
  }
}

// Start scheduler (check every 30 seconds)
function startScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
  }
  schedulerInterval = setInterval(processScheduledPosts, 30 * 1000);
  console.log("[FEWFEED Server] Scheduler started");
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

    if (path === "/") {
      return serveStatic("./public/index.html");
    }

    return serveStatic(`./public${path}`);
  },
});

// Start the scheduler for processing scheduled posts
startScheduler();

console.log(`
  Fewfeed v3.0

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
