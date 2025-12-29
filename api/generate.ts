import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI, Modality } from '@google/genai';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY) {
    return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    const { prompt, referenceImage, referenceImages } = req.body;

    // Use provided prompt or default for image variations
    const finalPrompt = prompt || 'Create 4 creative variations of this image for social media advertising. Make them visually appealing and professional.';

    // Support both single referenceImage and array referenceImages
    const refImg = referenceImage || (referenceImages && referenceImages[0]);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    const contents: any[] = [];

    // Add reference image if provided
    if (refImg?.data) {
      contents.push({
        inlineData: {
          mimeType: refImg.mimeType || 'image/png',
          data: refImg.data,
        },
      });
    }

    // Add text prompt
    contents.push({ text: finalPrompt });

    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash-exp-image-generation',
      contents: [{ role: 'user', parts: contents }],
      config: {
        responseModalities: [Modality.TEXT, Modality.IMAGE],
      },
    });

    // Extract images from response
    const images: string[] = [];
    if (response.candidates?.[0]?.content?.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData?.data) {
          const mimeType = part.inlineData.mimeType || 'image/png';
          images.push(`data:${mimeType};base64,${part.inlineData.data}`);
        }
      }
    }

    if (images.length === 0) {
      return res.status(400).json({ error: 'No images generated' });
    }

    return res.status(200).json({ images });
  } catch (error) {
    console.error('[Pubilo] Generate error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
