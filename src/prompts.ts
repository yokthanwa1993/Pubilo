/**
 * PROMPTS & CONFIGURATION
 *
 * You can edit the behavior of the AI here.
 * This file separates the "Logic" from the "Creative Instructions".
 */

// ------------------------------------------------------------------
// 1. APP CONFIGURATION (NEW)
// Control resolution, size, and models here.
// ------------------------------------------------------------------
export const CONFIG = {
  // Models
  generationModel: 'gemini-3-pro-image-preview', // Used for final image
  analysisModel: 'gemini-3-pro-preview',       // Used for layout planning

  // Output Specs
  aspectRatio: '1:1', // Options: '1:1', '3:4', '4:3', '16:9', '9:16'
  resolution: '2K',   // Options: '1K', '2K', '4K' (Higher = Sharper but slower)
  variationCount: 1,  // Changed from 4 to 1 - generate 1 image only
};

// ------------------------------------------------------------------
// 2. ANALYSIS PROMPT
// Used to understand the images, detect text, and plan the layout.
// ------------------------------------------------------------------
export const ANALYSIS_PROMPT = `
    You are a Senior Photo Editor for a Tabloid News Agency.
    TASK: Analyze these images to create a dramatic "Breaking News" photo montage.

    STEP 1: DETECT TEXT & SCREENSHOTS (CRITICAL)
    - Scan all images. Is any image a **Screenshot, Social Media Comment, News Headline, or Chat Bubble**?
    - If YES -> You MUST assign it as an **Insert** with type "TEXT".

    STEP 2: SELECT ROLES
    - **Main Subject**: Best emotional face/action (Clear, Sharp).
    - **Background**: Atmospheric shot (can be wide).
    - **Inserts**: Select 2-4 images. Mix "PHOTO" types and "TEXT" types if available.

    STEP 3: DEFINE FOCAL POINTS
    - **For TEXT images**: Crop to the actual text message/headline. It MUST be readable.
    - **For PHOTO images**: Zoom in on faces, hands, or key details.

    STEP 4: ASSIGN SHAPES
    - **TEXT Type**: MUST be **RECTANGLE** (to keep text readable).
    - **PHOTO Type**: Can be CIRCLE (for faces) or RECTANGLE.

    OUTPUT JSON ONLY:
    {
      "selected_indices": [0, 1, 2],
      "layout_strategy": {
         "background_index": 0,
         "main_subject_index": 1,
         "inserts": [
            {
              "index": 2,
              "type": "TEXT",
              "shape": "RECTANGLE",
              "size": "LARGE",
              "crop_instruction": "Crop to the comment text: '15 days 14 nights...' ensure full text is visible."
            },
            {
              "index": 0,
              "type": "PHOTO",
              "shape": "CIRCLE",
              "size": "SMALL",
              "crop_instruction": "Focus on the hands cutting the cake."
            }
         ]
      },
      "subject_visual_lock": "Describe main subject's appearance (Hair color, Dress color) to prevent hallucination.",
      "layout_instruction": "Main Subject on Right. Text Headline (Img 2) overlaid on bottom left. Small Circle Insert (Cake) on top left."
    }
`;

// ------------------------------------------------------------------
// 3. GENERATION PROMPT TEMPLATE
// Used to generate the final image.
// Placeholders like {{key}} will be replaced by the code dynamically.
// ------------------------------------------------------------------
export const GENERATION_PROMPT_TEMPLATE = `
    SYSTEM INSTRUCTION: YOU ARE A NON-GENERATIVE COMPOSITING ENGINE.

    CRITICAL RULE: **ZERO HALLUCINATION POLICY**
    1. **DO NOT DRAW**: You are strictly prohibited from drawing new people, new faces, or new objects.
    2. **COPY & PASTE ONLY**: Your ONLY job is to cut pixels from the provided input images and arrange them.
    3. **FACE PRESERVATION**: The Main Subject (Index {{main_subject_index}}) MUST look exactly like the source photo. Do not "beautify" or "reimagine" the face.
    4. **NO INVENTED BACKGROUNDS**: Use the provided background image (Index {{background_index}}) as the canvas. Do not generate a fake studio background.

    INPUT: {{input_count}} Source Images.
    TASK: Create a high-fidelity News Montage using ONLY the provided pixels.

    STRICT COMPOSITION LAYERS:

    1. **BACKGROUND LAYER** (Image Index {{background_index}}):
       - Use this EXACT image as the base.

    2. **MAIN SUBJECT LAYER** (Image Index {{main_subject_index}}):
       - Cut out subject: "{{subject_description}}".
       - **KEEP ORIGINAL FACE PIXELS**.

    3. **INSERT FRAMES LAYER** (Overlays):
       {{insert_frames_instruction}}

    QUALITY & CLEANUP:
    - **WATERMARK REMOVAL**: Automatically DETECT and REMOVE any existing watermarks, logos, or timestamps from the source images.
    - **TEXT CLARITY**: If an insert is text, keep it RECTANGULAR and READABLE. Ensure letters are sharp.
    - **STYLE**: Thai News Tabloid (Red Borders, Dramatic, Sharp, High Contrast).

    NEGATIVE PROMPT (STRICT):
    - **Drawing, Painting, CGI, 3D Render, Illustration, Cartoon**.
    - **New people not in source images**.
    - **Altered facial features**.
    - Watermarks, logos, credit text.
    - Unreadable text.
`;
