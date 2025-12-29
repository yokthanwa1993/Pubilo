import { serve, file } from "bun";
import { join, extname } from "path";

const PORT = 3000;
const PUBLIC_DIR = join(import.meta.dir, "public");
const API_DIR = join(import.meta.dir, "api");

const mimeTypes: Record<string, string> = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const path = url.pathname;

    // Handle API routes
    if (path.startsWith("/api/")) {
      const apiFile = path.replace("/api/", "").replace(/\/$/, "") || "index";
      const apiPath = join(API_DIR, `${apiFile}.ts`);

      try {
        const module = await import(apiPath);
        const handler = module.default;

        // Create mock Vercel request/response
        const body = req.method !== "GET" ? await req.json().catch(() => ({})) : {};
        const mockReq = { method: req.method, body, headers: Object.fromEntries(req.headers) };

        let responseData: any = null;
        let statusCode = 200;
        let responseHeaders: Record<string, string> = { "Content-Type": "application/json" };

        const mockRes = {
          status: (code: number) => { statusCode = code; return mockRes; },
          json: (data: any) => { responseData = data; return mockRes; },
          setHeader: (key: string, value: string) => { responseHeaders[key] = value; return mockRes; },
          end: () => { return mockRes; },
        };

        await handler(mockReq, mockRes);

        return new Response(responseData ? JSON.stringify(responseData) : "", {
          status: statusCode,
          headers: responseHeaders,
        });
      } catch (e: any) {
        console.error(`API Error [${path}]:`, e.message);
        return new Response(JSON.stringify({ error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Static files
    let filePath = join(PUBLIC_DIR, path === "/" ? "index.html" : path);

    // Try with .html extension for SPA routes
    let f = file(filePath);
    if (!(await f.exists())) {
      f = file(join(PUBLIC_DIR, "index.html"));
    }

    const ext = extname(filePath);
    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new Response(f, { headers: { "Content-Type": contentType } });
  },
});

console.log(`Dev server running at http://localhost:${PORT}`);
