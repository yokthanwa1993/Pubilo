import { NextRequest } from "next/server";
import puppeteerCore from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import sharp from "sharp";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMP_DIR = join(process.cwd(), "public", "temp");

const FONT_MAP: Record<string, string> = {
  "noto-sans-thai": "Noto Sans Thai",
  "noto-serif-thai": "Noto Serif Thai",
  "sarabun": "Sarabun",
  "prompt": "Prompt",
  "kanit": "Kanit",
  "mitr": "Mitr",
  "chakra-petch": "Chakra Petch",
  "anuphan": "Anuphan",
  "itim": "Itim",
  "pattaya": "Pattaya",
  "sriracha": "Sriracha",
};

async function getBrowser() {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    const puppeteer = await import("puppeteer-core");
    return puppeteer.default.launch({
      headless: true,
      executablePath: process.platform === "darwin"
        ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        : "/usr/bin/google-chrome",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return puppeteerCore.launch({
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
    ],
    defaultViewport: { width: 800, height: 1200 },
    executablePath: "/usr/bin/chromium-browser",
    headless: true,
  });
}

export async function GET(request: NextRequest) {
  let browser = null;
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "Default Text";
    const imageUrl = searchParams.get("image") || "";
    const fontId = searchParams.get("font") || "noto-sans-thai";
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
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily}:wght@700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 800px; height: 1200px; font-family: '${fontName}', sans-serif; overflow: hidden; }
    .container {
      width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
      ${imageUrl ? `background-image: url('${imageUrl}'); background-size: cover; background-position: center;` : `background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);`}
      position: relative;
    }
    .overlay { position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%); ${imageUrl ? '' : 'display: none;'} }
    .text { position: relative; z-index: 1; font-size: ${fontSize}px; font-weight: 700; color: white; text-align: center; line-height: 1.6; text-shadow: 0 4px 12px rgba(0,0,0,0.6); max-width: 720px; padding: 40px; word-wrap: break-word; white-space: pre-wrap; }
  </style>
</head>
<body>
  <div class="container">
    <div class="overlay"></div>
    <div class="text">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
  </div>
</body>
</html>`;

    browser = await getBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 800, height: 1200 });
    await page.setContent(html, { waitUntil: "networkidle0" });
    await page.evaluate(() => document.fonts.ready);
    const pngBuffer = await page.screenshot({ type: "png" });
    await browser.close();
    browser = null;

    // Convert to WEBP
    const webpBuffer = await sharp(pngBuffer).webp({ quality: 90 }).toBuffer();

    // Save to temp directory
    if (!existsSync(TEMP_DIR)) {
      await mkdir(TEMP_DIR, { recursive: true });
    }

    const filename = `${randomUUID()}.webp`;
    const filepath = join(TEMP_DIR, filename);
    await writeFile(filepath, webpBuffer);

    // Get host from request
    const host = request.headers.get("host") || "og-image.lslly.com";
    const protocol = request.headers.get("x-forwarded-proto") || "https";
    const publicUrl = `${protocol}://${host}/temp/${filename}`;

    return new Response(JSON.stringify({
      success: true,
      url: publicUrl,
      filename: filename,
      size: webpBuffer.length,
      generatedAt: new Date().toISOString(),
    }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    if (browser) await browser.close();
    console.error("Error:", error);
    return new Response(JSON.stringify({
      success: false,
      error: String(error),
    }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
}
