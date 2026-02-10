import { NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const TEMP_DIR = join(process.cwd(), "public", "temp");

const FONT_MAP: Record<string, string> = {
  "noto-sans-thai": "Noto+Sans+Thai",
  "prompt": "Prompt",
  "kanit": "Kanit",
};

export async function GET(request: NextRequest) {
  let browser = null;
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "Default";
    const imageUrl = searchParams.get("image") || "";
    const fontId = searchParams.get("font") || "noto-sans-thai";
    const fontFamily = FONT_MAP[fontId] || "Noto+Sans+Thai";

    // Auto-scale font
    const len = text.length;
    let fontSize = 72;
    if (len > 200) fontSize = 36;
    else if (len > 150) fontSize = 42;
    else if (len > 100) fontSize = 48;
    else if (len > 60) fontSize = 56;
    else if (len > 30) fontSize = 64;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family=${fontFamily}:wght@700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      width: 800px; height: 1200px;
      display: flex; align-items: center; justify-content: center;
      ${imageUrl 
        ? `background: url('${imageUrl}') center/cover;`
        : `background: linear-gradient(135deg, #667eea, #764ba2);`
      }
      position: relative;
    }
    .overlay {
      position: absolute; inset: 0;
      background: linear-gradient(to bottom, rgba(0,0,0,0.3), rgba(0,0,0,0.7));
      ${imageUrl ? '' : 'display: none;'}
    }
    .text {
      position: relative; z-index: 1;
      font-size: ${fontSize}px; font-weight: 700;
      color: white; text-align: center; line-height: 1.6;
      text-shadow: 0 4px 12px rgba(0,0,0,0.6);
      max-width: 720px; padding: 40px;
      white-space: pre-wrap;
    }
  </style>
</head>
<body>
  <div class="overlay"></div>
  <div class="text">${text.replace(/</g, '&lt;')}</div>
</body>
</html>`;

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
    
    const png = await page.screenshot({ type: "png" });
    await browser.close();
    browser = null;

    // Save to temp
    if (!existsSync(TEMP_DIR)) await mkdir(TEMP_DIR, { recursive: true });
    
    const filename = `${randomUUID()}.png`;
    await writeFile(join(TEMP_DIR, filename), png);

    const host = request.headers.get("host") || "og-image.lslly.com";
    const protocol = request.headers.get("x-forwarded-proto") || "https";

    return Response.json({
      success: true,
      url: `${protocol}://${host}/api/temp/${filename}`,
      filename,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    if (browser) await browser.close();
    console.error(e);
    return Response.json({ success: false, error: String(e) }, { status: 500 });
  }
}
