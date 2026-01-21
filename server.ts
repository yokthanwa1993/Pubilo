import { serve } from "bun";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// Import API handlers
const apiModules: Record<string, any> = {};

// Dynamic import all API handlers
const apiFiles = [
  "auto-hide-config", "auto-hide", "auto-post-config", "auto-post-logs",
  "check-pending-shares", "cron-auto-post", "cron-earnings", "delete-post",
  "earnings", "generate-news", "generate", "global-settings", "line-webhook",
  "page-settings", "pages", "prompts", "publish", "quotes", "scheduled-posts",
  "tokens", "update-post-time", "upload-image"
];

for (const file of apiFiles) {
  try {
    apiModules[file] = await import(`./api/${file}.ts`);
  } catch (e) {
    console.log(`Warning: Could not load api/${file}.ts`);
  }
}

const PORT = process.env.PORT || 80;
const PUBLIC_DIR = join(import.meta.dir, "public");

// MIME types
const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
};

function getMimeType(path: string): string {
  const ext = path.substring(path.lastIndexOf("."));
  return mimeTypes[ext] || "application/octet-stream";
}

// Create mock Vercel request/response
function createVercelRequest(req: Request, body: any): any {
  const url = new URL(req.url);
  return {
    method: req.method,
    url: url.pathname + url.search,
    headers: Object.fromEntries(req.headers.entries()),
    query: Object.fromEntries(url.searchParams.entries()),
    body: body,
    on: (event: string, callback: Function) => {
      if (event === "data") callback(JSON.stringify(body));
      if (event === "end") callback();
    },
  };
}

function createVercelResponse(): { res: any; getResponse: () => Promise<Response> } {
  let statusCode = 200;
  let headers: Record<string, string> = {};
  let responseBody: any = null;
  let ended = false;

  const res = {
    status: (code: number) => {
      statusCode = code;
      return res;
    },
    setHeader: (key: string, value: string) => {
      headers[key] = value;
      return res;
    },
    json: (data: any) => {
      headers["Content-Type"] = "application/json";
      responseBody = JSON.stringify(data);
      ended = true;
      return res;
    },
    send: (data: any) => {
      responseBody = data;
      ended = true;
      return res;
    },
    end: (data?: any) => {
      if (data) responseBody = data;
      ended = true;
      return res;
    },
  };

  return {
    res,
    getResponse: async () => {
      // Wait for response to be ready
      let attempts = 0;
      while (!ended && attempts < 600) {
        await new Promise((r) => setTimeout(r, 100));
        attempts++;
      }
      return new Response(responseBody, {
        status: statusCode,
        headers: new Headers(headers),
      });
    },
  };
}

serve({
  port: PORT,
  idleTimeout: 120, // 2 minutes timeout for long API calls
  async fetch(req) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    console.log(`${req.method} ${pathname}`);

    // Handle API routes
    if (pathname.startsWith("/api/")) {
      const apiName = pathname.replace("/api/", "").replace(/\/$/, "");
      const handler = apiModules[apiName];

      if (handler?.default) {
        try {
          let body = null;
          if (req.method === "POST" || req.method === "PUT" || req.method === "PATCH") {
            const contentType = req.headers.get("content-type") || "";
            if (contentType.includes("application/json")) {
              body = await req.json();
            } else {
              body = await req.text();
            }
          }

          const vercelReq = createVercelRequest(req, body);
          const { res, getResponse } = createVercelResponse();

          // Call the handler
          await handler.default(vercelReq, res);

          return await getResponse();
        } catch (error) {
          console.error(`API Error (${apiName}):`, error);
          return new Response(JSON.stringify({ error: String(error) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      }

      return new Response("Not Found", { status: 404 });
    }

    // Serve static files
    let filePath = join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

    // SPA fallback - if file doesn't exist, serve index.html
    if (!existsSync(filePath)) {
      filePath = join(PUBLIC_DIR, "index.html");
    }

    try {
      const file = readFileSync(filePath);
      return new Response(file, {
        headers: { "Content-Type": getMimeType(filePath) },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  },
});

console.log(`🚀 Server running on http://localhost:${PORT}`);
