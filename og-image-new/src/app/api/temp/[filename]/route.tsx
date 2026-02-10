import { NextRequest } from "next/server";
import { readFile } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const TEMP_DIR = join(process.cwd(), "public", "temp");

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // Security: prevent directory traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return new Response("Forbidden", { status: 403 });
    }
    
    const filepath = join(TEMP_DIR, filename);
    const file = await readFile(filepath);
    
    const ext = filename.split(".").pop()?.toLowerCase();
    const contentType = ext === "png" ? "image/png" : 
                       ext === "jpg" || ext === "jpeg" ? "image/jpeg" : 
                       ext === "webp" ? "image/webp" :
                       "application/octet-stream";
    
    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (e) {
    return new Response("Not found", { status: 404 });
  }
}
