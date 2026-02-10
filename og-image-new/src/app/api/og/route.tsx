import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 30;

const FREEIMAGE_API_KEY = "6d207e02198a847aa98d0a2a901485a5";

const FONT_MAP: Record<string, string> = {
  "noto-sans-thai": "Noto Sans Thai",
  "noto-serif-thai": "Noto Serif Thai",
  "sarabun": "Sarabun",
  "prompt": "Prompt",
  "kanit": "Kanit",
};

export async function GET(request: NextRequest) {
  let browser = null;

  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "Default Text";
    const imageUrl = searchParams.get("image") || "";
    const fontId = searchParams.get("font") || "noto-sans-thai";
    const outputFormat = searchParams.get("output") || "image";

    const fontName = FONT_MAP[fontId] || "Noto Sans Thai";
    const fontFamily = fontName.replace(/ /g, "+");

    // Auto-scale font size
    const textLength = text.length;
    let fontSize = 72;
    if (textLength > 200) fontSize = 36;
    else if (textLength > 150) fontSize = 42;
    else if (textLength > 100) fontSize = 48;
    else if (textLength > 60) fontSize = 56;
    else if (textLength > 30) fontSize = 64;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily}:wght@400;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 800px; height: 1200px;
      font-family: '${fontName}', sans-serif;
      overflow: hidden;
    }
    .container {
      width: 100%; height: 100%;
      display: flex; align-items: center; justify-content: center;
      ${imageUrl ? `
        background-image: url('${imageUrl}');
        background-size: cover;
        background-position: center;
      ` : `
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      `}
      position: relative;
    }
    .overlay {
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%);
      ${imageUrl ? '' : 'display: none;'}
    }
    .text {
      position: relative; z-index: 1;
      font-size: ${fontSize}px; font-weight: 700;
      color: white; text-align: center; line-height: 1.6;
      letter-spacing: 0.02em;
      text-shadow: 0 4px 12px rgba(0,0,0,0.6);
      max-width: 720px; padding: 40px;
      word-wrap: break-word; white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="overlay"></div>
    <div class="text">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  </div>
</body>
</html>`;

    // ใช้ Chromium ที่ติดตั้งใน Docker
    browser = await puppeteer.launch({
      executablePath: "/usr/bin/chromium",
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote',
        '--single-process',
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);

    const pngBuffer = await page.screenshot({ type: "png" });
    await browser.close();
    browser = null;

    // Convert to WEBP
    const outputBuffer = await sharp(pngBuffer)
      .webp({ quality: 90, effort: 4 })
      .toBuffer();

    // If output=json, upload to freeimage.host and return JSON
    if (outputFormat === "json") {
      const base64 = outputBuffer.toString("base64");

      const formData = new FormData();
      formData.append("key", FREEIMAGE_API_KEY);
      formData.append("action", "upload");
      formData.append("source", base64);
      formData.append("format", "json");

      const uploadRes = await fetch("https://freeimage.host/api/1/upload", {
        method: "POST",
        body: formData,
      });

      const json = await uploadRes.json();

      return new Response(JSON.stringify(json, null, 2), {
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // Default: return image
    return new Response(new Uint8Array(outputBuffer), {
      headers: {
        "Content-Type": "image/webp",
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error("OG Image generation error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate image", details: String(error) }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}
