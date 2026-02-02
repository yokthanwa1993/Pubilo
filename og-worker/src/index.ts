import { Hono } from 'hono';
import { cors } from 'hono/cors';
import satori from 'satori';
import { Resvg, initWasm } from '@resvg/resvg-wasm';
// @ts-ignore
import resvgWasm from '@resvg/resvg-wasm/index_bg.wasm';

// Font mapping
const FONT_MAP: Record<string, string> = {
    'noto-sans-thai': 'Noto Sans Thai',
    'noto-serif-thai': 'Noto Serif Thai',
    'sarabun': 'Sarabun',
    'prompt': 'Prompt',
    'kanit': 'Kanit',
    'mitr': 'Mitr',
    'chakra-petch': 'Chakra Petch',
    'anuphan': 'Anuphan',
    'athiti': 'Athiti',
    'bai-jamjuree': 'Bai Jamjuree',
    'ibm-plex-sans-thai': 'IBM Plex Sans Thai',
    'k2d': 'K2D',
    'kodchasan': 'Kodchasan',
    'krub': 'Krub',
    'mali': 'Mali',
    'maitree': 'Maitree',
    'niramit': 'Niramit',
    'pridi': 'Pridi',
    'taviraj': 'Taviraj',
    'trirong': 'Trirong',
    'chonburi': 'Chonburi',
    'itim': 'Itim',
    'koho': 'KoHo',
    'sriracha': 'Sriracha',
};

let wasmInitialized = false;

const app = new Hono();
app.use('*', cors());

// Font cache
const fontCache = new Map<string, ArrayBuffer>();

async function loadFont(fontName: string): Promise<ArrayBuffer> {
    const cached = fontCache.get(fontName);
    if (cached) return cached;

    // Load from Google Fonts API
    const fontUrl = `https://fonts.googleapis.com/css2?family=${fontName.replace(/ /g, '+')}:wght@400;700&display=swap`;
    const cssRes = await fetch(fontUrl);
    const css = await cssRes.text();

    // Extract font URL from CSS
    const urlMatch = css.match(/src:\s*url\(([^)]+)\)/);
    if (!urlMatch) {
        // Fallback to Noto Sans Thai
        const fallbackUrl = 'https://fonts.gstatic.com/s/notosansthai/v25/iJWQBXeUZi_OHPqn4wq6hQ2_hbJ1xyN9wd43SofNWcdHrpOdGw0xGznaOQ.woff2';
        const fontRes = await fetch(fallbackUrl);
        const fontData = await fontRes.arrayBuffer();
        fontCache.set(fontName, fontData);
        return fontData;
    }

    const fontFileUrl = urlMatch[1].replace(/['"]/g, '');
    const fontRes = await fetch(fontFileUrl);
    const fontData = await fontRes.arrayBuffer();
    fontCache.set(fontName, fontData);
    return fontData;
}

// GET /api/og - Generate OG image
app.get('/api/og', async (c) => {
    try {
        // Initialize WASM once
        if (!wasmInitialized) {
            await initWasm(resvgWasm);
            wasmInitialized = true;
        }

        const text = c.req.query('text') || 'Default Text';
        const imageUrl = c.req.query('image') || '';
        const fontId = c.req.query('font') || 'noto-sans-thai';

        const fontName = FONT_MAP[fontId] || 'Noto Sans Thai';

        // Auto-scale font size based on text length
        const textLength = text.length;
        let fontSize = 72;
        if (textLength > 200) fontSize = 36;
        else if (textLength > 150) fontSize = 42;
        else if (textLength > 100) fontSize = 48;
        else if (textLength > 60) fontSize = 56;
        else if (textLength > 30) fontSize = 64;

        // Load font
        const fontData = await loadFont(fontName);

        // Create SVG with Satori
        const svg = await satori(
            {
                type: 'div',
                props: {
                    style: {
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundImage: imageUrl ? `url(${imageUrl})` : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        position: 'relative',
                    },
                    children: [
                        // Overlay (only if background image)
                        imageUrl && {
                            type: 'div',
                            props: {
                                style: {
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    bottom: 0,
                                    background: 'linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0.7) 100%)',
                                },
                            },
                        },
                        // Text
                        {
                            type: 'div',
                            props: {
                                style: {
                                    fontSize: `${fontSize}px`,
                                    fontWeight: 700,
                                    color: 'white',
                                    textAlign: 'center',
                                    lineHeight: 1.6,
                                    textShadow: '0 4px 12px rgba(0,0,0,0.6)',
                                    maxWidth: '720px',
                                    padding: '40px',
                                    wordWrap: 'break-word',
                                    zIndex: 1,
                                },
                                children: text,
                            },
                        },
                    ].filter(Boolean),
                },
            },
            {
                width: 800,
                height: 1200,
                fonts: [
                    {
                        name: fontName,
                        data: fontData,
                        weight: 400,
                        style: 'normal',
                    },
                    {
                        name: fontName,
                        data: fontData,
                        weight: 700,
                        style: 'normal',
                    },
                ],
            }
        );

        // Convert SVG to PNG using resvg
        const resvg = new Resvg(svg, {
            fitTo: {
                mode: 'width',
                value: 800,
            },
        });
        const pngData = resvg.render();
        const pngBuffer = pngData.asPng();

        return new Response(pngBuffer, {
            headers: {
                'Content-Type': 'image/png',
                'Cache-Control': 'public, max-age=86400',
            },
        });
    } catch (err) {
        console.error('OG Image error:', err);
        return c.json({ error: String(err) }, 500);
    }
});

// Health check
app.get('/', (c) => c.json({ status: 'ok', service: 'pubilo-og' }));

export default app;
