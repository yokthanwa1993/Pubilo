import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';
import { CONFIG, ANALYSIS_PROMPT, GENERATION_PROMPT_TEMPLATE } from './prompts';

interface ReferenceImage {
  id?: string;
  data: string; // Base64
  mimeType: string;
}

/**
 * Helper to replace placeholders in the prompt template
 */
const fillTemplate = (template: string, replacements: Record<string, string>): string => {
  let result = template;
  for (const key in replacements) {
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, replacements[key]);
  }
  return result;
};

/**
 * Step 1: Analyze images to select the best ones and assign layout roles.
 */
async function analyzeImages(
  ai: GoogleGenAI,
  referenceImages: ReferenceImage[]
): Promise<string> {
  const parts: any[] = [];

  // Add each image with its index label
  referenceImages.forEach((img, index) => {
    parts.push({
      text: `Image Index [${index}]:`,
    });
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data,
      },
    });
  });

  // Add the analysis prompt
  parts.push({ text: ANALYSIS_PROMPT });

  try {
    const response = await ai.models.generateContent({
      model: CONFIG.analysisModel,
      contents: { parts },
      config: {
        responseMimeType: 'application/json',
      },
    });
    return response.text || '';
  } catch (error) {
    console.warn('[Pubilo] Analysis failed:', error);
    return '';
  }
}

/**
 * Step 2: Generate the final image using analysis context.
 */
async function generateImages(
  ai: GoogleGenAI,
  referenceImages: ReferenceImage[],
  analysisContext: string,
  aspectRatio: string = CONFIG.aspectRatio
): Promise<string[]> {
  // 1. Process Analysis Result
  let selectedImages: ReferenceImage[] = referenceImages;
  let subjectDescription = '';
  let layoutStrategy: any = {};

  if (analysisContext) {
    try {
      const cleanJson = analysisContext
        .replace(/```json/g, '')
        .replace(/```/g, '')
        .trim();
      const parsed = JSON.parse(cleanJson);

      if (
        parsed.selected_indices &&
        Array.isArray(parsed.selected_indices) &&
        parsed.selected_indices.length > 0
      ) {
        selectedImages = referenceImages.filter((_, i) =>
          parsed.selected_indices.includes(i)
        );
      }

      if (parsed.subject_visual_lock) subjectDescription = parsed.subject_visual_lock;
      if (parsed.layout_strategy) layoutStrategy = parsed.layout_strategy;
    } catch (e) {
      console.warn('[Pubilo] Failed to parse analysis JSON, using all images.', e);
    }
  }

  // Fallback
  if (selectedImages.length === 0) {
    selectedImages = referenceImages.slice(0, 4);
  }

  // 2. Build Content Parts
  const parts: any[] = [];
  selectedImages.forEach((img) => {
    parts.push({
      inlineData: {
        mimeType: img.mimeType,
        data: img.data,
      },
    });
  });

  // Construct dynamic insert instruction
  const inserts = layoutStrategy.inserts || [];
  let insertPrompt = '';

  if (Array.isArray(inserts) && inserts.length > 0) {
    insertPrompt = `CREATE ${inserts.length} INSERT FRAMES (Picture-in-Picture). Follow these EXACT specifications:\n`;

    inserts.forEach((ins: any, i: number) => {
      const isText =
        ins.type === 'TEXT' ||
        (ins.crop_instruction && ins.crop_instruction.toLowerCase().includes('text'));
      const shape = isText ? 'RECTANGLE' : ins.shape || 'RECTANGLE';

      insertPrompt += `
        FRAME ${i + 1} (${isText ? 'TEXT CONTENT' : 'PHOTO CONTENT'}):
          - Source Image Index: ${ins.index}
          - Shape: ${shape} ${isText ? '(MANDATORY RECTANGLE FOR TEXT)' : ''}
          - Size: ${ins.size}
          - **CROP FOCUS**: ${ins.crop_instruction || 'Focus on the most interesting detail.'}
          ${isText ? '- **TEXT RULE**: This is a text/screenshot. Ensure the text inside the frame is LEGIBLE and SHARP. Do not crop out the words.' : ''}
          - Style: Thick RED border.
        `;
    });

    insertPrompt += `
       \nGENERAL FRAME RULES:
       - **TEXT FRAMES**: Must be treated as "Headlines" or "Quotes". Place them where they are easy to read.
       - **PHOTO FRAMES**: Zoom in tight on faces/actions.
       - **PLACEMENT**: Arrange artistically. Do not cover the Main Subject's face.
     `;
  } else {
    insertPrompt =
      'Create insert frames for detail shots. If any image looks like text, keep it rectangular and readable.';
  }

  // 3. Prompt Engineering using Template
  const finalPrompt = fillTemplate(GENERATION_PROMPT_TEMPLATE, {
    input_count: selectedImages.length.toString(),
    background_index: (layoutStrategy.background_index ?? 0).toString(),
    main_subject_index: (layoutStrategy.main_subject_index ?? 0).toString(),
    subject_description: subjectDescription,
    insert_frames_instruction: insertPrompt,
  });

  parts.push({ text: finalPrompt });

  // 4. Parallel generation based on CONFIG.variationCount
  const requestCount = CONFIG.variationCount || 1;
  const generatePromises = Array(requestCount)
    .fill(null)
    .map(() =>
      ai.models.generateContent({
        model: CONFIG.generationModel,
        contents: {
          parts: parts,
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: CONFIG.resolution,
          },
        },
      })
    );

  const results = await Promise.allSettled(generatePromises);
  const generatedImages: string[] = [];
  let lastError: any = null;

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const response = result.value;
      if (response.candidates && response.candidates.length > 0) {
        const content = response.candidates[0].content;
        if (content && content.parts) {
          for (const part of content.parts) {
            if (part.inlineData && part.inlineData.data) {
              const base64Str = part.inlineData.data;
              const mimeType = part.inlineData.mimeType || 'image/png';
              generatedImages.push(`data:${mimeType};base64,${base64Str}`);
            }
          }
        }
      }
    } else {
      lastError = result.reason;
      console.warn('[Pubilo] One generation request failed:', result.reason);
    }
  }

  if (generatedImages.length === 0) {
    if (lastError) {
      throw lastError;
    }
    throw new Error('No image data found in response.');
  }

  return generatedImages;
}

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
    const { referenceImage, referenceImages, aspectRatio } = req.body;

    // Support both single referenceImage and array referenceImages
    let images: ReferenceImage[] = [];

    if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
      images = referenceImages;
    } else if (referenceImage?.data) {
      images = [referenceImage];
    }

    if (images.length === 0) {
      return res.status(400).json({ error: 'No reference images provided' });
    }

    // Use custom aspect ratio if provided, otherwise use CONFIG default
    const finalAspectRatio = aspectRatio || CONFIG.aspectRatio;
    console.log('[Pubilo] Using aspect ratio:', finalAspectRatio);

    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // Step 1: Analyze Images
    console.log('[Pubilo] Step 1: Analyzing composition...');
    const analysisResult = await analyzeImages(ai, images);
    console.log('[Pubilo] Analysis Result:', analysisResult);

    // Step 2: Generate Images using analysis context
    console.log(`[Pubilo] Step 2: Rendering ${CONFIG.variationCount} variations...`);
    const generatedImages = await generateImages(ai, images, analysisResult, finalAspectRatio);

    console.log(`[Pubilo] Successfully generated ${generatedImages.length} images`);
    return res.status(200).json({ images: generatedImages });
  } catch (error) {
    console.error('[Pubilo] Generate error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
