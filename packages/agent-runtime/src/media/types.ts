/**
 * OneShot Agent Runtime — Multimodal Vision & Media Types
 *
 * Provides schemas, options, and data structures for:
 * 1. Image attachments (OCR, design review, visual bug detection)
 * 2. Viewport & component screenshots
 * 3. Text-to-image and visual asset generation
 */

import type { ImageFormat } from "@strands-agents/sdk";

export type SupportedImageFormat = ImageFormat;

export interface ImageAttachmentInput {
  filePath?: string;
  dataUrl?: string;
  base64?: string;
  format?: SupportedImageFormat;
  description?: string;
}

export interface CaptureScreenshotInput {
  url?: string;
  outputPath?: string;
  viewportWidth?: number;
  viewportHeight?: number;
  fullPage?: boolean;
}

export interface GenerateImageInput {
  prompt: string;
  outputPath?: string;
  aspectRatio?: "1:1" | "16:9" | "4:3" | "9:16";
  format?: SupportedImageFormat;
  style?: "photorealistic" | "ui-mockup" | "diagram" | "icon" | "wireframe";
}

export interface VisualAnalysisResult {
  filePath?: string;
  format: SupportedImageFormat;
  byteSize: number;
  description?: string;
  detectedElements?: string[];
  dimensions?: { width: number; height: number };
}
