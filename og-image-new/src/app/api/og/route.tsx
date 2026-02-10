import { NextRequest } from "next/server";
import { ImageResponse } from "@vercel/og";

export const runtime = "nodejs";

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const text = searchParams.get("text") || "Default Text";
    const imageUrl = searchParams.get("image") || "";
    const fontId = searchParams.get("font") || "noto-sans-thai";
    const fontName = FONT_MAP[fontId] || "Noto Sans Thai";

    // Auto-scale font size
    const textLength = text.length;
    let fontSize = 72;
    if (textLength > 200) fontSize = 36;
    else if (textLength > 150) fontSize = 42;
    else if (textLength > 100) fontSize = 48;
    else if (textLength > 60) fontSize = 56;
    else if (textLength > 30) fontSize = 64;

    return new ImageResponse(
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
              fontFamily: fontName,
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
