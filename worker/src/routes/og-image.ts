import { Hono } from 'hono';
import { svg2png, initialize } from 'svg2png-wasm';
// @ts-ignore
import wasm from 'svg2png-wasm/svg2png_wasm_bg.wasm';
// @ts-ignore
import NotoSansThaiRegular from '../fonts/NotoSansThai-Regular.ttf';
// @ts-ignore  
import NotoSansThaiSemiBold from '../fonts/NotoSansThai-Bold.ttf';

type Bindings = {
    DB: D1Database;
    IMAGES: R2Bucket;
};

let wasmInitialized = false;

const app = new Hono<{ Bindings: Bindings }>();

// GET /api/og - Generate OG image as PNG
app.get('/', async (c) => {
    try {
        // Initialize WASM once
        if (!wasmInitialized) {
            await initialize(wasm);
            wasmInitialized = true;
        }

        const text = c.req.query('text') || 'Default Text';
        const imageUrl = c.req.query('image') || '';

        // Auto-scale font size based on text length
        const textLength = text.length;
        let fontSize = 72;
        if (textLength > 200) fontSize = 36;
        else if (textLength > 150) fontSize = 42;
        else if (textLength > 100) fontSize = 48;
        else if (textLength > 60) fontSize = 56;
        else if (textLength > 30) fontSize = 64;

        // Wrap text manually
        const maxWidth = 720;
        const charsPerLine = Math.floor(maxWidth / (fontSize * 0.55));
        const words = text.split('');
        const lines: string[] = [];
        let currentLine = '';

        for (const char of words) {
            if (currentLine.length >= charsPerLine) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine += char;
            }
        }
        if (currentLine) lines.push(currentLine);

        const lineHeight = fontSize * 1.6;
        const totalTextHeight = lines.length * lineHeight;
        const startY = (1200 - totalTextHeight) / 2 + fontSize;

        const textElements = lines.map((line, i) => {
            const y = startY + i * lineHeight;
            return `<text x="400" y="${y}" text-anchor="middle" fill="white" font-size="${fontSize}" font-weight="700" font-family="Noto Sans Thai" style="filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6));">${escapeXml(line)}</text>`;
        }).join('\n');

        let backgroundDef = '';
        let backgroundRect = '';

        if (imageUrl) {
            backgroundDef = `<image href="${escapeXml(imageUrl)}" x="0" y="0" width="800" height="1200" preserveAspectRatio="xMidYMid slice"/>`;
            backgroundRect = `<rect x="0" y="0" width="800" height="1200" fill="url(#overlay)"/>`;
        } else {
            backgroundRect = `<rect x="0" y="0" width="800" height="1200" fill="url(#gradient)"/>`;
        }

        // Embed font as base64
        const fontBuffer = new Uint8Array(NotoSansThaiSemiBold);
        const fontBase64 = btoa(String.fromCharCode(...fontBuffer));

        const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="800" height="1200" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
    <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#667eea"/>
            <stop offset="100%" style="stop-color:#764ba2"/>
        </linearGradient>
        <linearGradient id="overlay" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style="stop-color:rgba(0,0,0,0.3)"/>
            <stop offset="100%" style="stop-color:rgba(0,0,0,0.7)"/>
        </linearGradient>
        <style type="text/css">
            @font-face {
                font-family: 'Noto Sans Thai';
                src: url(data:font/ttf;base64,${fontBase64}) format('truetype');
                font-weight: 700;
            }
        </style>
    </defs>
    ${backgroundDef}
    ${backgroundRect}
    ${textElements}
</svg>`;

        // Convert SVG to PNG
        const pngBuffer = await svg2png(svg, {
            width: 800,
            height: 1200,
            fonts: [
                new Uint8Array(NotoSansThaiRegular),
                new Uint8Array(NotoSansThaiSemiBold),
            ],
        });

        return new Response(pngBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (err) {
        console.error('[og-image] Error:', err);
        return c.json({ error: String(err) }, 500);
    }
});

function escapeXml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

export const ogImageRouter = app;
