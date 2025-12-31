import type { VercelRequest, VercelResponse } from '@vercel/node';

// Inline CONFIG to avoid any import issues
const CONFIG = {
  generationModel: 'gemini-2.0-flash-exp',
  analysisModel: 'gemini-2.0-flash',
  aspectRatio: '1:1',
  resolution: '2K',
  variationCount: 1, // Changed to 1 for faster generation
};

const ANALYSIS_PROMPT = 'Analyze these images and return JSON with selected_indices array.';
const GENERATION_PROMPT_TEMPLATE = 'Generate an image based on these inputs.';

interface ReferenceImage {
  id?: string;
  data: string; // Base64
  mimeType: string;
}

// Direct API call to Gemini instead of using SDK
async function callGeminiAPI(apiKey: string, model: string, contents: any, config?: any) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const body: any = {
    contents: [contents],
  };

  if (config) {
    body.generationConfig = config;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${error}`);
  }

  return response.json();
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
  apiKey: string,
  referenceImages: ReferenceImage[]
): Promise<string> {
  const parts: any[] = [];

  // Add each image with its index label
  referenceImages.forEach((img, index) => {
    parts.push({ text: `Image Index [${index}]:` });
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
    const response = await callGeminiAPI(
      apiKey,
      CONFIG.analysisModel,
      { parts },
      { responseMimeType: 'application/json' }
    );

    const text = response?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return text;
  } catch (error) {
    console.warn('[Pubilo] Analysis failed:', error);
    return '';
  }
}

/**
 * Step 2: Generate the final image using analysis context.
 */
async function generateImages(
  apiKey: string,
  referenceImages: ReferenceImage[],
  analysisContext: string,
  aspectRatio: string = CONFIG.aspectRatio,
  generationModel: string = CONFIG.generationModel
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
      callGeminiAPI(apiKey, generationModel, { parts }, {
        responseModalities: ['IMAGE', 'TEXT'],
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
  console.log('[Pubilo] Generate API called');

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
  console.log('[Pubilo] API Key exists:', !!GEMINI_API_KEY);

  if (!GEMINI_API_KEY) {
    return res.status(400).json({ error: 'GEMINI_API_KEY not configured' });
  }

  try {
    console.log('[Pubilo] Request body keys:', Object.keys(req.body || {}));
    const { referenceImage, referenceImages, aspectRatio, model, prompt, caption, numberOfImages, resolution, customPrompt } = req.body;

    // Support both single referenceImage and array referenceImages
    let images: ReferenceImage[] = [];

    if (referenceImages && Array.isArray(referenceImages) && referenceImages.length > 0) {
      images = referenceImages;
    } else if (referenceImage?.data) {
      images = [referenceImage];
    }

    // Use custom settings if provided, otherwise use CONFIG defaults
    const finalAspectRatio = aspectRatio || CONFIG.aspectRatio;
    const finalModel = model || CONFIG.generationModel;
    const finalCount = numberOfImages || CONFIG.variationCount;
    const finalResolution = resolution || CONFIG.resolution;
    console.log('[Pubilo] Using aspect ratio:', finalAspectRatio);
    console.log('[Pubilo] Using model:', finalModel);
    console.log('[Pubilo] Using resolution:', finalResolution);
    console.log('[Pubilo] Number of images:', finalCount);

    // TEXT-ONLY GENERATION: If no images but prompt/caption provided
    if (images.length === 0 && (prompt || caption)) {
      console.log('[Pubilo] Text-only generation mode');

      // Build prompt - use custom prompt if provided, otherwise use default
      let textPrompt: string;
      const quoteText = caption || prompt;

      if (customPrompt && customPrompt.trim()) {
        // Use custom prompt template - replace placeholders
        textPrompt = customPrompt
          .replace(/\{\{QUOTE\}\}/g, quoteText)
          .replace(/\{\{ASPECT_RATIO\}\}/g, finalAspectRatio)
          .replace(/\{\{RESOLUTION\}\}/g, finalResolution);
        console.log('[Pubilo] Using custom prompt template');
      } else {
        // Use default prompt
        textPrompt = `สร้างรูปภาพสำหรับโพสต์ Facebook ที่มีลักษณะดังนี้:

**พื้นหลัง:**
- ภาพถ่ายธรรมชาติสวยงาม เช่น พระอาทิตย์ตก/ขึ้น ภูเขา ทะเล ท้องฟ้า หมอก ทุ่งหญ้า
- สีโทนอบอุ่น gradient จากส้มทอง เหลือง ไปฟ้าอ่อน
- ภาพต้องมีความชัด สวยงาม ดูสงบ ให้ความรู้สึกผ่อนคลาย

**ข้อความภาษาไทย:**
"${quoteText}"

**การจัดวางข้อความ:**
- ข้อความอยู่ตรงกลางบน-กลางรูป (ประมาณ 1/3 บนของรูป)
- ฟอนต์หนา ตัวใหญ่ อ่านง่าย
- สีข้อความเป็นสีเข้ม (ดำหรือน้ำตาลเข้ม) ให้ตัดกับพื้นหลังสีอ่อน
- มีเงาข้อความเล็กน้อยให้อ่านง่ายขึ้น
- แบ่งบรรทัดให้สวยงาม อ่านง่าย

**สไตล์โดยรวม:**
- ดูเป็นมืออาชีพ เหมาะโพสต์ Facebook
- รูปแบบ Quote/คำคม ที่นิยมใน Social Media ไทย
- ขนาดรูป: ${finalAspectRatio}`;
      }

      try {
        const generatePromises = Array(finalCount)
          .fill(null)
          .map(() =>
            callGeminiAPI(GEMINI_API_KEY, finalModel, { parts: [{ text: textPrompt }] }, {
              responseModalities: ['IMAGE', 'TEXT'],
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
            console.warn('[Pubilo] Text generation failed:', result.reason);
          }
        }

        if (generatedImages.length === 0) {
          if (lastError) throw lastError;
          throw new Error('No image generated from text prompt');
        }

        console.log(`[Pubilo] Successfully generated ${generatedImages.length} images from text`);
        return res.status(200).json({ images: generatedImages });
      } catch (genError) {
        console.error('[Pubilo] Text-to-image generation failed:', genError);
        const errorMessage = genError instanceof Error ? genError.message : 'Unknown generation error';
        return res.status(500).json({ error: 'Generation failed: ' + errorMessage });
      }
    }

    // IMAGE-BASED GENERATION: Original flow with reference images
    if (images.length === 0) {
      return res.status(400).json({ error: 'No reference images or prompt provided' });
    }

    // Step 1: Analyze Images
    console.log('[Pubilo] Step 1: Analyzing composition...');
    let analysisResult = '';
    try {
      analysisResult = await analyzeImages(GEMINI_API_KEY, images);
      console.log('[Pubilo] Analysis Result:', analysisResult);
    } catch (analysisError) {
      console.warn('[Pubilo] Analysis failed, proceeding without it:', analysisError);
    }

    // Step 2: Generate Images using analysis context
    console.log(`[Pubilo] Step 2: Rendering ${finalCount} variations with model: ${finalModel}...`);
    try {
      const generatedImages = await generateImages(GEMINI_API_KEY, images, analysisResult, finalAspectRatio, finalModel);
      console.log(`[Pubilo] Successfully generated ${generatedImages.length} images`);
      return res.status(200).json({ images: generatedImages });
    } catch (genError) {
      console.error('[Pubilo] Image generation failed:', genError);
      const errorMessage = genError instanceof Error ? genError.message : 'Unknown generation error';
      return res.status(500).json({ error: 'Generation failed: ' + errorMessage });
    }
  } catch (error) {
    console.error('[Pubilo] Generate error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
