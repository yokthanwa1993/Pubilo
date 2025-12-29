export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  aspectRatio: string;
  resolution: string;
  timestamp: number;
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageResolution = '1K' | '2K' | '4K';

export interface GenerationConfig {
  aspectRatio: AspectRatio;
  resolution: ImageResolution;
}

export interface ReferenceImage {
  id: string;
  data: string; // Base64
  mimeType: string;
}
