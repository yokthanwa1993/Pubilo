use ab_glyph::{Font, FontArc, Glyph, PxScale, point, ScaleFont};
use console_error_panic_hook;
use image::{imageops, Rgba, RgbaImage};
use imageproc::drawing::draw_text_mut;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use worker::*;

#[derive(Deserialize, Debug)]
struct GenerateParams {
    #[serde(default = "default_text")]
    text: String,
    #[serde(default = "default_font")]
    font: String,
    #[serde(default)]
    image: Option<String>,
}

#[derive(Serialize)]
struct GenerateResponse {
    success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    filename: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<String>,
}

fn default_text() -> String {
    "Hello World".to_string()
}

fn default_font() -> String {
    "noto-sans-thai".to_string()
}

// Load font by name
fn load_font(font_name: &str) -> Result<FontArc> {
    match font_name {
        "kanit" => {
            let font_data = include_bytes!("kanit-bold.ttf");
            FontArc::try_from_slice(font_data)
                .map_err(|e| Error::RustError(format!("Failed to load Kanit font: {}", e)))
        }
        "noto-sans-thai" | _ => {
            let font_data = include_bytes!("noto-sans-thai-bold.ttf");
            FontArc::try_from_slice(font_data)
                .map_err(|e| Error::RustError(format!("Failed to load Noto Sans Thai font: {}", e)))
        }
    }
}

// Auto-scale font size based on text length (larger sizes)
fn get_font_size(text_len: usize) -> f32 {
    if text_len > 200 { 48.0 }
    else if text_len > 150 { 56.0 }
    else if text_len > 100 { 64.0 }
    else if text_len > 60 { 76.0 }
    else if text_len > 30 { 88.0 }
    else { 100.0 }
}

// Wrap text with max width in pixels
fn wrap_text_by_width(text: &str, font: &FontArc, scale: PxScale, max_width: f32) -> Vec<String> {
    let mut lines = Vec::new();
    let scaled_font = font.as_scaled(scale);
    
    for paragraph in text.split('\n') {
        let mut current_line = String::new();
        let mut current_width = 0.0;
        
        for word in paragraph.split_whitespace() {
            let word_width: f32 = word.chars().map(|c| {
                let glyph_id = font.glyph_id(c);
                scaled_font.h_advance(glyph_id)
            }).sum();
            
            let space_width = scaled_font.h_advance(font.glyph_id(' '));
            
            if current_line.is_empty() {
                current_line = word.to_string();
                current_width = word_width;
            } else if current_width + space_width + word_width <= max_width {
                current_line.push(' ');
                current_line.push_str(word);
                current_width += space_width + word_width;
            } else {
                lines.push(current_line);
                current_line = word.to_string();
                current_width = word_width;
            }
        }
        
        if !current_line.is_empty() {
            lines.push(current_line);
        }
    }
    
    if lines.is_empty() {
        lines.push(text.to_string());
    }
    
    lines
}

fn measure_text_width(font: &FontArc, text: &str, scale: PxScale) -> f32 {
    let scaled_font = font.as_scaled(scale);
    text.chars().map(|c| {
        let glyph_id = font.glyph_id(c);
        scaled_font.h_advance(glyph_id)
    }).sum()
}

async fn fetch_image(url: &str) -> Result<RgbaImage> {
    console_log!("Fetching image from: {}", url);
    
    let mut headers = Headers::new();
    headers.set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")?;
    
    let request = Request::new_with_init(url, &RequestInit {
        method: Method::Get,
        headers,
        ..Default::default()
    })?;
    
    let mut response = Fetch::Request(request).send().await?;
    
    if response.status_code() != 200 {
        return Err(Error::RustError(format!("HTTP {}", response.status_code())));
    }
    
    let bytes = response.bytes().await?;
    console_log!("Downloaded {} bytes", bytes.len());
    
    let img = image::load_from_memory(&bytes)
        .map_err(|e| Error::RustError(format!("Failed to load image: {}", e)))?;
    
    Ok(img.to_rgba8())
}

// Original gradient: linear-gradient(135deg, #667eea, #764ba2)
fn create_gradient_background(width: u32, height: u32) -> RgbaImage {
    let mut img = RgbaImage::new(width, height);
    
    let start_color = (0x66, 0x7e, 0xea); // #667eea
    let end_color = (0x76, 0x4b, 0xa2);   // #764ba2
    
    for y in 0..height {
        for x in 0..width {
            // 135 degrees gradient (from top-left to bottom-right)
            let ratio = ((x as f32) + (height - y) as f32) / ((width + height) as f32);
            let ratio = ratio.clamp(0.0, 1.0);
            
            let r = (start_color.0 as f32 * (1.0 - ratio) + end_color.0 as f32 * ratio) as u8;
            let g = (start_color.1 as f32 * (1.0 - ratio) + end_color.1 as f32 * ratio) as u8;
            let b = (start_color.2 as f32 * (1.0 - ratio) + end_color.2 as f32 * ratio) as u8;
            
            img.put_pixel(x, y, Rgba([r, g, b, 255]));
        }
    }
    
    img
}

// No shadow - clean text
fn draw_text_clean(img: &mut RgbaImage, font: &FontArc, text: &str, x: i32, y: i32, scale: PxScale) {
    let color = Rgba([255, 255, 255, 255]);
    draw_text_mut(img, color, x, y, scale, font, text);
}

async fn generate_og_image(text: &str, background_url: Option<&str>, font_name: &str) -> Result<Vec<u8>> {
    // Portrait mode: 800x1200 (same as original system)
    let width = 800u32;
    let height = 1200u32;
    let padding = 40;
    let max_text_width = (width - 2 * padding) as f32;
    
    // Load or create background
    let mut img = if let Some(url) = background_url {
        match fetch_image(url).await {
            Ok(bg) => {
                console_log!("Background loaded: {}x{}", bg.width(), bg.height());
                
                // Resize to fit 800x1200 with cover mode
                let bg_aspect = bg.width() as f32 / bg.height() as f32;
                let target_aspect = width as f32 / height as f32;
                
                let (new_w, new_h) = if bg_aspect > target_aspect {
                    let h = height;
                    let w = (h as f32 * bg_aspect) as u32;
                    (w, h)
                } else {
                    let w = width;
                    let h = (w as f32 / bg_aspect) as u32;
                    (w, h)
                };
                
                let resized = imageops::resize(&bg, new_w, new_h, imageops::FilterType::Lanczos3);
                
                // Crop to center
                let x = (new_w - width) / 2;
                let y = (new_h - height) / 2;
                imageops::crop_imm(&resized, x, y, width, height).to_image()
            }
            Err(e) => {
                console_log!("Failed to load background: {}, using gradient", e);
                create_gradient_background(width, height)
            }
        }
    } else {
        console_log!("No background URL, using gradient");
        create_gradient_background(width, height)
    };
    
    // Add overlay for background images (linear-gradient to bottom, rgba(0,0,0,0.3) to rgba(0,0,0,0.7))
    if background_url.is_some() {
        for y in 0..height {
            let ratio = y as f32 / height as f32;
            let alpha = 0.3 + (0.7 - 0.3) * ratio;
            
            for x in 0..width {
                let pixel = img.get_pixel(x, y);
                let inv_alpha = 1.0 - alpha;
                
                let r = ((pixel[0] as f32 * inv_alpha) as u8).saturating_add((0.0 * alpha) as u8);
                let g = ((pixel[1] as f32 * inv_alpha) as u8).saturating_add((0.0 * alpha) as u8);
                let b = ((pixel[2] as f32 * inv_alpha) as u8).saturating_add((0.0 * alpha) as u8);
                img.put_pixel(x, y, Rgba([r, g, b, 255]));
            }
        }
    }
    
    // Load font by name
    let font = load_font(font_name)?;
    
    // Auto-scale font size based on text length (count grapheme clusters for Thai)
    let text_len = text.chars().filter(|c| !c.is_ascii_punctuation() && !c.is_whitespace()).count();
    let font_size = get_font_size(text_len);
    let scale = PxScale::from(font_size);
    let line_height = (font_size * 1.1) as i32;
    
    console_log!("Font size: {}, Line height: {}", font_size, line_height);
    
    // Wrap text by width (max 720px)
    let lines = wrap_text_by_width(text, &font, scale, max_text_width - 80.0); // 80px for padding
    
    let total_height = lines.len() as i32 * line_height;
    let start_y = ((height as i32 - total_height) / 2).max(padding as i32);
    
    console_log!("Drawing {} lines of text", lines.len());
    
    // Draw each line centered
    for (i, line) in lines.iter().enumerate() {
        let line_width = measure_text_width(&font, line, scale);
        let x = ((width as f32 - line_width) / 2.0).max(padding as f32) as i32;
        let y = start_y + (i as i32 * line_height);
        
        draw_text_clean(&mut img, &font, line, x, y, scale);
    }
    
    // Encode to PNG
    let mut output = Vec::new();
    img.write_to(&mut Cursor::new(&mut output), image::ImageFormat::Png)
        .map_err(|e| Error::RustError(format!("Failed to encode image: {}", e)))?;
    
    console_log!("Generated image: {} bytes", output.len());
    Ok(output)
}

#[event(fetch)]
async fn main(req: Request, env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();
    
    let router = Router::new();
    
    router
        .get("/", |_, _| {
            Response::ok("OG Image Worker - Rust Edition\n\nEndpoints:\n- GET /api/generate.png?text=...&font=...&image=...\n- POST /api/generate")
        })
        .get("/health", |_, _| {
            Response::from_json(&serde_json::json!({
                "status": "healthy",
                "version": "0.1.0"
            }))
        })
        .get_async("/api/generate.png", |req, _ctx| async move {
            let url = req.url().map_err(|e| Error::RustError(e.to_string()))?;
            let query = url.query().unwrap_or("");
            
            let params: GenerateParams = match serde_urlencoded::from_str(query) {
                Ok(p) => p,
                Err(_) => GenerateParams {
                    text: default_text(),
                    font: default_font(),
                    image: None,
                },
            };
            
            console_log!("Generating image for text: {:?}", params.text);
            
            match generate_og_image(&params.text, params.image.as_deref(), &params.font).await {
                Ok(image_data) => {
                    let mut headers = Headers::new();
                    headers.set("Content-Type", "image/png")?;
                    headers.set("Cache-Control", "public, max-age=3600")?;
                    
                    Ok(Response::from_bytes(image_data)?.with_headers(headers))
                }
                Err(e) => {
                    console_log!("Error generating image: {}", e);
                    Response::from_json(&GenerateResponse {
                        success: false,
                        url: None,
                        filename: None,
                        error: Some(e.to_string()),
                    })
                }
            }
        })
        .post_async("/api/generate", |mut req, _ctx| async move {
            let params = req.json::<GenerateParams>().await
                .map_err(|e| Error::RustError(format!("Invalid JSON: {}", e)))?;
            
            console_log!("POST generate for: {:?}", params.text);
            
            match generate_og_image(&params.text, params.image.as_deref(), &params.font).await {
                Ok(image_data) => {
                    let mut headers = Headers::new();
                    headers.set("Content-Type", "image/png")?;
                    headers.set("Cache-Control", "public, max-age=3600")?;
                    
                    Ok(Response::from_bytes(image_data)?.with_headers(headers))
                }
                Err(e) => {
                    Response::from_json(&GenerateResponse {
                        success: false,
                        url: None,
                        filename: None,
                        error: Some(e.to_string()),
                    })
                }
            }
        })
        .run(req, env)
        .await
}
