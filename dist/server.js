// @bun
// src/facebook.ts
var API_VERSION = "v21.0";
var API_BASE = `https://graph.facebook.com/${API_VERSION}`;

class FacebookPublisher {
  config;
  log;
  constructor(config, log = console.log) {
    this.config = config;
    this.log = log;
  }
  async request(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Cookie: this.config.cookieData,
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        ...options.headers
      }
    });
    const data = await response.json();
    if (data.error) {
      const errorMsg = data.error.error_user_msg || data.error.message;
      throw new Error(errorMsg);
    }
    return data;
  }
  async createAdCreative(options) {
    this.log("STEP 1: Creating Ad Creative...");
    const payload = {
      object_story_spec: {
        link_data: {
          picture: options.imageUrl,
          description: options.description || this.config.defaults.description,
          link: options.linkUrl,
          name: options.linkName,
          multi_share_optimized: true,
          multi_share_end_card: false,
          caption: options.caption || this.config.defaults.caption,
          call_to_action: { type: "LEARN_MORE" }
        },
        page_id: this.config.pageId
      }
    };
    const url = `${API_BASE}/${this.config.adAccountId}/adcreatives?access_token=${this.config.accessToken}&fields=effective_object_story_id`;
    const data = await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    this.log(`   Creative ID: ${data.id}`);
    return data.id;
  }
  async triggerProcessing(creativeId) {
    this.log("STEP 2: Triggering processing...");
    const url = `${API_BASE}/${creativeId}?access_token=${this.config.accessToken}&fields=effective_object_story_id`;
    try {
      await this.request(url);
      this.log("   Trigger sent");
    } catch {
      this.log("   Trigger failed, continuing...");
    }
  }
  async getPageToken() {
    this.log("STEP 3: Getting Page Token...");
    const url = `${API_BASE}/${this.config.pageId}?access_token=${this.config.accessToken}&fields=access_token`;
    const data = await this.request(url);
    this.log("   Page token retrieved");
    return data.access_token;
  }
  async waitForPostId(creativeId, maxAttempts = 10) {
    this.log("STEP 4: Waiting for Post ID...");
    const url = `${API_BASE}/${creativeId}?access_token=${this.config.accessToken}&fields=effective_object_story_id`;
    for (let i = 1;i <= maxAttempts; i++) {
      try {
        const data = await this.request(url);
        if (data.effective_object_story_id) {
          this.log(`   Post ID: ${data.effective_object_story_id}`);
          return data.effective_object_story_id;
        }
      } catch {}
      if (i < maxAttempts) {
        this.log(`   Attempt ${i}/${maxAttempts}, waiting 3s...`);
        await Bun.sleep(3000);
      }
    }
    throw new Error(`Post ID not available after ${maxAttempts} attempts`);
  }
  async publishPost(postId) {
    this.log("STEP 5: Publishing post...");
    const url = `${API_BASE}/${postId}?access_token=${this.config.accessToken2}`;
    await this.request(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ is_published: true })
    });
    this.log("   Post published!");
  }
  async publish(options) {
    this.log(`Starting Facebook publish...
`);
    const creativeId = await this.createAdCreative(options);
    await this.triggerProcessing(creativeId);
    await this.getPageToken();
    const postId = await this.waitForPostId(creativeId);
    await this.publishPost(postId);
    const result = {
      success: true,
      postId,
      url: `https://www.facebook.com/${postId}`,
      creativeId
    };
    this.log(`
Done! View post: ${result.url}`);
    return result;
  }
}

// src/gemini.ts
var GENERATION_MODEL = "gemini-2.0-flash-exp";

class GeminiGenerator {
  apiKey;
  constructor(apiKey) {
    this.apiKey = apiKey;
  }
  async generate(referenceImages) {
    const parts = [];
    referenceImages.forEach((img) => {
      parts.push({
        inlineData: {
          mimeType: img.mimeType,
          data: img.data
        }
      });
    });
    const prompt = `
      Create a visually striking promotional image based on these reference images.
      Style: Modern, professional, eye-catching for social media.
      Output: Generate a high-quality promotional image suitable for Facebook posts.
      Requirements:
      - Clear and sharp composition
      - Vibrant colors
      - Professional look
      - 1:1 aspect ratio
    `;
    parts.push({ text: prompt });
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GENERATION_MODEL}:generateContent?key=${this.apiKey}`;
    const requests = Array(4).fill(null).map(() => fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ["image", "text"],
          responseMimeType: "image/png"
        }
      })
    }));
    const responses = await Promise.allSettled(requests);
    const generatedImages = [];
    for (const result of responses) {
      if (result.status === "fulfilled") {
        const data = await result.value.json();
        if (data.candidates && data.candidates[0]?.content?.parts) {
          for (const part of data.candidates[0].content.parts) {
            if (part.inlineData?.data) {
              const mimeType = part.inlineData.mimeType || "image/png";
              generatedImages.push(`data:${mimeType};base64,${part.inlineData.data}`);
            }
          }
        }
      }
    }
    if (generatedImages.length === 0) {
      throw new Error("Failed to generate images");
    }
    return generatedImages;
  }
}

// src/server.ts
var PORT = 3000;
var config = {
  accessToken: Bun.env.ACCESS_TOKEN || "",
  accessToken2: Bun.env.ACCESS_TOKEN2 || "",
  cookieData: Bun.env.COOKIE_DATA || "",
  adAccountId: Bun.env.AD_ACCOUNT_ID || "",
  pageId: Bun.env.PAGE_ID || "",
  defaults: {
    linkUrl: Bun.env.DEFAULT_LINK_URL || "",
    linkName: Bun.env.DEFAULT_LINK_NAME || "",
    caption: Bun.env.DEFAULT_CAPTION || "",
    description: Bun.env.DEFAULT_DESCRIPTION || ""
  }
};
var FREEIMAGE_API_KEY = Bun.env.FREEIMAGE_API_KEY || "";
var GEMINI_API_KEY = Bun.env.GEMINI_API_KEY || "";
var queue = [];
var autoPostInterval = null;
var autoPostEnabled = false;
var postIntervalMinutes = 30;
var stats = {
  generated: 0,
  published: 0,
  failed: 0
};
async function uploadToFreeImage(file, log) {
  log("Uploading to freeimage.host...");
  const formData = new FormData;
  formData.append("key", FREEIMAGE_API_KEY);
  formData.append("action", "upload");
  formData.append("source", file);
  formData.append("format", "json");
  const response = await fetch("https://freeimage.host/api/1/upload", {
    method: "POST",
    body: formData
  });
  const data = await response.json();
  if (data.status_code !== 200 || !data.image?.url) {
    throw new Error("Failed to upload image");
  }
  log(`   URL: ${data.image.url}`);
  return data.image.url;
}
var MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif"
};
function getMime(path) {
  const ext = path.substring(path.lastIndexOf("."));
  return MIME[ext] || "application/octet-stream";
}
async function serveStatic(path) {
  const file = Bun.file(path);
  if (await file.exists()) {
    return new Response(file, {
      headers: { "Content-Type": getMime(path) }
    });
  }
  return new Response("Not Found", { status: 404 });
}
async function handlePublish(req) {
  const formData = await req.formData();
  const imageFile = formData.get("image");
  const linkUrl = formData.get("linkUrl");
  const linkName = formData.get("linkName");
  const caption = formData.get("caption");
  const description = formData.get("description");
  const accessToken = formData.get("accessToken") || config.accessToken;
  const accessToken2 = formData.get("accessToken2") || config.accessToken2;
  const cookieData = formData.get("cookieData") || config.cookieData;
  if (!imageFile) {
    return Response.json({ error: "No image uploaded" }, { status: 400 });
  }
  if (!linkUrl || !linkName) {
    return Response.json({ error: "Missing linkUrl or linkName" }, { status: 400 });
  }
  const encoder = new TextEncoder;
  const stream = new ReadableStream({
    async start(controller) {
      const log = (msg) => {
        controller.enqueue(encoder.encode(msg + `
`));
      };
      try {
        const imageUrl = await uploadToFreeImage(imageFile, log);
        const publisher = new FacebookPublisher({ ...config, accessToken, accessToken2, cookieData }, log);
        const result = await publisher.publish({
          imageUrl,
          linkUrl,
          linkName,
          caption: caption || config.defaults.caption,
          description: description || config.defaults.description
        });
        log(`
{"success":true,"url":"${result.url}"}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        log(`
Error: ${msg}`);
        log(`
{"success":false,"error":"${msg}"}`);
      } finally {
        controller.close();
      }
    }
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache"
    }
  });
}
async function handleGenerate(req) {
  if (!GEMINI_API_KEY) {
    return Response.json({ error: "GEMINI_API_KEY not configured" }, { status: 400 });
  }
  const formData = await req.formData();
  const files = formData.getAll("images");
  if (files.length === 0) {
    return Response.json({ error: "No images uploaded" }, { status: 400 });
  }
  try {
    const generator = new GeminiGenerator(GEMINI_API_KEY);
    const referenceImages = await Promise.all(files.map(async (file) => {
      const buffer = await file.arrayBuffer();
      const base64 = Buffer.from(buffer).toString("base64");
      return {
        data: base64,
        mimeType: file.type
      };
    }));
    const images = await generator.generate(referenceImages);
    stats.generated += images.length;
    return Response.json({ success: true, images });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: msg }, { status: 500 });
  }
}
function processNextInQueue() {
  if (queue.length === 0 || !autoPostEnabled)
    return;
  const item = queue.find((i) => i.status === "pending");
  if (!item)
    return;
  item.status = "processing";
  (async () => {
    try {
      let imageUrl = item.imageUrl;
      if (imageUrl.startsWith("data:")) {
        const base64Data = imageUrl.split(",")[1];
        const mimeType = imageUrl.split(";")[0].split(":")[1];
        const buffer = Buffer.from(base64Data, "base64");
        const blob = new Blob([buffer], { type: mimeType });
        const file = new File([blob], "image.png", { type: mimeType });
        imageUrl = await uploadToFreeImage(file, console.log);
      }
      const publisher = new FacebookPublisher(config, console.log);
      const result = await publisher.publish({
        imageUrl,
        linkUrl: item.linkUrl,
        linkName: item.linkName,
        caption: item.caption || config.defaults.caption,
        description: item.description || config.defaults.description
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
  processNextInQueue();
}
function stopAutoPost() {
  autoPostEnabled = false;
  if (autoPostInterval) {
    clearInterval(autoPostInterval);
    autoPostInterval = null;
  }
}
var server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === "/api/config" && req.method === "GET") {
      return Response.json(config);
    }
    if (path === "/api/publish" && req.method === "POST") {
      return handlePublish(req);
    }
    if (path === "/api/generate" && req.method === "POST") {
      return handleGenerate(req);
    }
    if (path === "/api/stats" && req.method === "GET") {
      return Response.json({
        ...stats,
        queued: queue.filter((i) => i.status === "pending").length
      });
    }
    if (path === "/api/queue" && req.method === "GET") {
      return Response.json({
        items: queue,
        autoPostEnabled,
        intervalMinutes: postIntervalMinutes
      });
    }
    if (path === "/api/queue" && req.method === "POST") {
      const body = await req.json();
      const item = {
        id: Date.now().toString(),
        imageUrl: body.imageUrl,
        linkUrl: body.linkUrl || config.defaults.linkUrl,
        linkName: body.linkName || config.defaults.linkName,
        caption: body.caption || config.defaults.caption,
        description: body.description || config.defaults.description,
        status: "pending",
        createdAt: new Date().toISOString()
      };
      queue.push(item);
      return Response.json({ success: true, item });
    }
    if (path === "/api/queue/start" && req.method === "POST") {
      const body = await req.json();
      if (body.intervalMinutes) {
        postIntervalMinutes = body.intervalMinutes;
      }
      startAutoPost();
      return Response.json({ success: true, autoPostEnabled: true });
    }
    if (path === "/api/queue/stop" && req.method === "POST") {
      stopAutoPost();
      return Response.json({ success: true, autoPostEnabled: false });
    }
    if (path.startsWith("/api/queue/") && req.method === "DELETE") {
      const id = path.split("/").pop();
      queue = queue.filter((i) => i.id !== id);
      return Response.json({ success: true });
    }
    if (path === "/") {
      return serveStatic("./public/index.html");
    }
    return serveStatic(`./public${path}`);
  }
});
console.log(`
  Fewfeed v2.0

  http://localhost:${server.port}
`);
