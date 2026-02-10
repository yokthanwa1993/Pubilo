import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";

const TEMP_DIR = join(process.cwd(), "public", "temp");

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "Default Text";
    const imageUrl = searchParams.get("image") || "";

    // Auto-scale font size
    const textLength = text.length;
    let fontSize = 72;
    if (textLength > 200) fontSize = 36;
    else if (textLength > 150) fontSize = 42;
    else if (textLength > 100) fontSize = 48;
    else if (textLength > 60) fontSize = 56;
    else if (textLength > 30) fontSize = 64;

    // Generate image with @vercel/og (no custom font for now)
    const imageResponse = new ImageResponse(
      (
        <div
          style={{
            width: 800,
            height: 1200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundImage: imageUrl ? `url(${imageUrl})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundColor: imageUrl ? undefined : "#667eea",
            position: "relative",
          }}
        >
          {imageUrl && (
            <div
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: "100%",
                background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)",
              }}
            />
          )}
          <div
            style={{
              position: "relative",
              zIndex: 1,
              fontSize,
              fontWeight: 700,
              color: "white",
              textAlign: "center",
              lineHeight: 1.6,
              textShadow: "0 4px 12px rgba(0,0,0,0.6)",
              maxWidth: 720,
              padding: 40,
              whiteSpace: "pre-wrap",
            }}
          >
            {text}
          </div>
        </div>
      ),
      {
        width: 800,
        height: 1200,
      }
    );

    // Get buffer
    const arrayBuffer = await imageResponse.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Save to temp directory
    if (!existsSync(TEMP_DIR)) {
      await mkdir(TEMP_DIR, { recursive: true });
    }

    const filename = `${randomUUID()}.png`;
    const filepath = join(TEMP_DIR, filename);
    await writeFile(filepath, buffer);

    // Get public URL
    const host = request.headers.get("host") || "og-image.lslly.com";
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const publicUrl = `${protocol}://${host}/temp/${filename}`;

    return new Response(
      JSON.stringify({
        success: true,
        url: publicUrl,
        filename: filename,
        size: buffer.length,
        generatedAt: new Date().toISOString(),
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
