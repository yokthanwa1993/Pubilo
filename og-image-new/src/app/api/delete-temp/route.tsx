import { NextRequest } from "next/server";
import { unlink, readdir, stat } from "fs/promises";
import { join } from "path";

export const runtime = "nodejs";

const TEMP_DIR = join(process.cwd(), "public", "temp");

// DELETE /api/delete-temp?filename=xxx.webp
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const filename = searchParams.get("filename");

    if (!filename) {
      return new Response(JSON.stringify({
        success: false,
        error: "Missing filename parameter",
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    // Security: only allow .webp files
    if (!filename.match(/^[a-f0-9-]+\.webp$/)) {
      return new Response(JSON.stringify({
        success: false,
        error: "Invalid filename",
      }), { status: 400, headers: { "Content-Type": "application/json" } });
    }

    const filepath = join(TEMP_DIR, filename);
    await unlink(filepath);

    return new Response(JSON.stringify({
      success: true,
      message: `File ${filename} deleted`,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Delete error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: String(error),
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}

// GET /api/delete-temp?olderThan=3600 (delete files older than X seconds)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const olderThan = parseInt(searchParams.get("olderThan") || "3600"); // default 1 hour

    const files = await readdir(TEMP_DIR);
    const now = Date.now();
    let deleted = 0;

    for (const file of files) {
      if (!file.endsWith(".webp")) continue;
      
      const filepath = join(TEMP_DIR, file);
      const stats = await stat(filepath);
      const age = (now - stats.mtime.getTime()) / 1000; // age in seconds

      if (age > olderThan) {
        await unlink(filepath);
        deleted++;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      deleted: deleted,
      message: `Deleted ${deleted} old files`,
    }), { headers: { "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Cleanup error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: String(error),
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
