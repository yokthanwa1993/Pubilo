import { GoogleGenAI } from "@google/genai";
import type { ReferenceImage } from "./types";
import { ANALYSIS_PROMPT, GENERATION_PROMPT_TEMPLATE, CONFIG } from "./prompts";

/**
 * Helper to replace placeholders in the prompt template
 */
const fillTemplate = (template: string, replacements: Record<string, string>) => {
  let result = template;
  for (const key in replacements) {
    // Replace {{key}} with value, globally
    const regex = new RegExp(`{{${key}}}`, 'g');
    result = result.replace(regex, replacements[key]);
  }
  return result;
};

export class GeminiGenerator {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Analyzes the uploaded images to select the best ones and assign layout roles.
   */
  async analyzeImages(referenceImages: ReferenceImage[]): Promise<string> {
    const parts: any[] = [];

    if (referenceImages && referenceImages.length > 0) {
      referenceImages.forEach((img, index) => {
        parts.push({
          text: `Image Index [${index}]:`
        });
        parts.push({
          inlineData: {
            mimeType: img.mimeType,
            data: img.data,
          },
        });
      });
    }

    // Use the imported prompt from prompts.ts
    parts.push({ text: ANALYSIS_PROMPT });

    try {
      const response = await this.ai.models.generateContent({
        model: CONFIG.analysisModel, // Use config
        contents: { parts },
        config: {
          responseMimeType: "application/json"
        }
      });
      return response.text || "";
    } catch (error) {
      console.warn("Analysis failed:", error);
      return "";
    }
  }

  async generate(referenceImages: ReferenceImage[]): Promise<string[]> {
    // Step 1: Analyze images
    console.log("Step 1: Analyzing images...");
    const analysisContext = await this.analyzeImages(referenceImages);
    console.log("Analysis result:", analysisContext);

    // 1. Process Analysis Result
    let selectedImages: ReferenceImage[] = referenceImages;
    let subjectDescription = "";
    let layoutStrategy: any = {};

    if (analysisContext) {
      try {
        const cleanJson = analysisContext.replace(/```json/g, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        if (parsed.selected_indices && Array.isArray(parsed.selected_indices) && parsed.selected_indices.length > 0) {
          selectedImages = referenceImages.filter((_, i) => parsed.selected_indices.includes(i));
        }

        if (parsed.subject_visual_lock) subjectDescription = parsed.subject_visual_lock;
        if (parsed.layout_strategy) layoutStrategy = parsed.layout_strategy;

      } catch (e) {
        console.warn("Failed to parse analysis JSON, using all images.", e);
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

    // Construct dynamic insert instruction (Logic remains here as it's algorithmic)
    const inserts = layoutStrategy.inserts || [];
    let insertPrompt = "";

    if (Array.isArray(inserts) && inserts.length > 0) {
      insertPrompt = `CREATE ${inserts.length} INSERT FRAMES (Picture-in-Picture). Follow these EXACT specifications:\n`;

      inserts.forEach((ins: any, i: number) => {
        const isText = (ins.type === 'TEXT') || (ins.crop_instruction && ins.crop_instruction.toLowerCase().includes('text'));
        const shape = isText ? 'RECTANGLE' : (ins.shape || 'RECTANGLE');

        insertPrompt += `
        FRAME ${i + 1} (${isText ? 'TEXT CONTENT' : 'PHOTO CONTENT'}):
          - Source Image Index: ${ins.index}
          - Shape: ${shape} ${isText ? '(MANDATORY RECTANGLE FOR TEXT)' : ''}
          - Size: ${ins.size}
          - **CROP FOCUS**: ${ins.crop_instruction || "Focus on the most interesting detail."}
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
      insertPrompt = "Create insert frames for detail shots. If any image looks like text, keep it rectangular and readable.";
    }

    // 3. Prompt Engineering using Template
    const finalPrompt = fillTemplate(GENERATION_PROMPT_TEMPLATE, {
      input_count: selectedImages.length.toString(),
      background_index: (layoutStrategy.background_index ?? 0).toString(),
      main_subject_index: (layoutStrategy.main_subject_index ?? 0).toString(),
      subject_description: subjectDescription,
      insert_frames_instruction: insertPrompt
    });

    parts.push({ text: finalPrompt });

    try {
      // Parallel generation based on CONFIG.variationCount
      const requestCount = CONFIG.variationCount || 1;
      const generatePromises = Array(requestCount).fill(null).map(() =>
        this.ai.models.generateContent({
          model: CONFIG.generationModel, // Use config
          contents: {
            parts: parts,
          },
          config: {
            imageConfig: {
              aspectRatio: CONFIG.aspectRatio, // Use config
              imageSize: CONFIG.resolution,    // Use config
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
          console.warn("One generation request failed:", result.reason);
        }
      }

      if (generatedImages.length === 0) {
        if (lastError) {
          if (lastError.message && lastError.message.includes("Requested entity was not found")) {
            throw new Error("API Key was invalid. Please select a valid key and try again.");
          }
          throw lastError;
        }
        throw new Error("No image data found in response.");
      }

      console.log(`Generated ${generatedImages.length} images successfully.`);
      return generatedImages;

    } catch (error: any) {
      console.error("Gemini Generation Error:", error);
      if (error.message && error.message.includes("Requested entity was not found")) {
        throw new Error("API Key was invalid. Please select a valid key and try again.");
      }
      throw error;
    }
  }
}
