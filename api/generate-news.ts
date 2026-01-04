import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from "@google/genai";

const ANALYSIS_MODEL = 'gemini-3-pro-preview';
const GENERATION_MODEL = 'gemini-3-pro-image-preview';

interface ReferenceImage {
  data: string;
  mimeType: string;
}

function fillTemplate(template: string, replacements: Record<string, string>) {
  let result = template;
  for (const key in replacements) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, replacements[key]);
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { referenceImages, analysisPrompt, generationPrompt, aspectRatio, variationCount } = req.body;

  if (!referenceImages || referenceImages.length === 0) {
    return res.status(400).json({ error: 'No images provided' });
  }

  const ai = new GoogleGenAI({ apiKey });

  try {
    // Step 1: Analyze images
    let analysisContext = "";
    if (analysisPrompt) {
      const analysisParts: any[] = [];
      referenceImages.forEach((img: ReferenceImage, index: number) => {
        analysisParts.push({ text: `Image Index [${index}]:` });
        analysisParts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      });
      analysisParts.push({ text: analysisPrompt });

      const analysisResponse = await ai.models.generateContent({
        model: ANALYSIS_MODEL,
        contents: { parts: analysisParts },
        config: { responseMimeType: "application/json" }
      });
      analysisContext = analysisResponse.text || "";
    }

    // Step 2: Parse analysis and prepare generation
    let selectedImages: ReferenceImage[] = referenceImages;
    let subjectDescription = "";
    let layoutStrategy: any = {};

    if (analysisContext) {
      try {
        const cleanJson = analysisContext.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        
        if (parsed.selected_indices?.length > 0) {
          selectedImages = referenceImages.filter((_: any, i: number) => parsed.selected_indices.includes(i));
        }
        if (parsed.subject_visual_lock) subjectDescription = parsed.subject_visual_lock;
        if (parsed.layout_strategy) layoutStrategy = parsed.layout_strategy;
      } catch (e) {
        console.warn("Failed to parse analysis JSON:", e);
      }
    }

    if (selectedImages.length === 0) selectedImages = referenceImages.slice(0, 4);

    // Build insert instruction
    const inserts = layoutStrategy.inserts || [];
    let insertPrompt = "";
    if (inserts.length > 0) {
      insertPrompt = `CREATE ${inserts.length} INSERT FRAMES:\n`;
      inserts.forEach((ins: any, i: number) => {
        const isText = ins.type === 'TEXT';
        insertPrompt += `FRAME ${i + 1}: Index ${ins.index}, Shape: ${isText ? 'RECTANGLE' : ins.shape}, Size: ${ins.size}, Crop: ${ins.crop_instruction || 'Focus on detail'}\n`;
      });
    }

    // Fill generation prompt template
    const finalPrompt = generationPrompt ? fillTemplate(generationPrompt, {
      input_count: selectedImages.length.toString(),
      background_index: (layoutStrategy.background_index ?? 0).toString(),
      main_subject_index: (layoutStrategy.main_subject_index ?? 0).toString(),
      subject_description: subjectDescription,
      insert_frames_instruction: insertPrompt
    }) : "Create a dramatic news montage from these images. Thai tabloid style with red borders.";

    // Step 3: Generate images
    const parts: any[] = [];
    selectedImages.forEach((img: ReferenceImage) => {
      parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
    });
    parts.push({ text: finalPrompt });

    const count = Math.min(variationCount || 4, 4);
    const resolution = req.body.aiResolution || '2K';
    
    const generateOne = () => ai.models.generateContent({
      model: GENERATION_MODEL,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: aspectRatio || '1:1',
          imageSize: resolution
        }
      }
    });

    const generatedImages: string[] = [];
    let attempts = 0;
    const maxAttempts = count + 2; // Allow some retries
    
    while (generatedImages.length < count && attempts < maxAttempts) {
      const needed = Math.min(count - generatedImages.length, 4);
      const promises = Array(needed).fill(null).map(() => generateOne());
      const results = await Promise.allSettled(promises);
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          const response = result.value;
          if (response.candidates?.[0]?.content?.parts) {
            for (const part of response.candidates[0].content.parts) {
              if (part.inlineData?.data && generatedImages.length < count) {
                const mimeType = part.inlineData.mimeType || 'image/png';
                generatedImages.push(`data:${mimeType};base64,${part.inlineData.data}`);
              }
            }
          }
        }
      }
      attempts++;
    }

    if (generatedImages.length === 0) {
      return res.status(500).json({ success: false, error: 'No images generated' });
    }

    return res.status(200).json({ success: true, images: generatedImages, analysis: analysisContext });

  } catch (error: any) {
    console.error('[generate-news] Error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
