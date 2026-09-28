/**
 * OneShot Agent Runtime — Multimodal Vision (Read) Tools
 *
 * Exposes one Strands SDK tool definition returning a native ImageBlock:
 * 1. read_image_attachment: Reads a real image file / attachment from disk or
 *    base64 and passes it to the model's visual reasoning engine.
 *
 * Screenshot capture and image generation were removed. Both previously wrote a
 * 1x1 transparent PNG while reporting SCREENSHOT_CAPTURED / IMAGE_GENERATED,
 * which fabricated a result that was never produced. An honest runtime reports
 * that a capability is unavailable rather than returning a placeholder.
 */

import {
  tool,
  ImageBlock,
  TextBlock,
  type ImageFormat,
  type ToolContext,
} from "@strands-agents/sdk";
import { z } from "zod";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { resolveContainedPath } from "../security/index.js";

/**
 * Root boundary for tool-supplied filesystem paths.
 *
 * Tool inputs (and any prompt-influenced value that reaches them) are untrusted,
 * so every path is resolved against the process workspace and must stay inside
 * it. This is deliberately the same root the rest of the runtime treats as the
 * workspace; it is not per-partition.
 */
const TOOL_PATH_ROOT = process.cwd();



/**
 * Detects format from file extension or MIME string.
 */
export function detectImageFormat(filenameOrMime: string): ImageFormat {
  const lower = filenameOrMime.toLowerCase();
  if (lower.endsWith(".png") || lower.includes("image/png")) return "png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.includes("image/jpeg")) return "jpeg";
  if (lower.endsWith(".webp") || lower.includes("image/webp")) return "webp";
  if (lower.endsWith(".gif") || lower.includes("image/gif")) return "gif";
  return "png";
}

/**
 * Tool 1: read_image_attachment
 * Reads an image file from disk or base64 and passes it to the agent's multimodal vision system.
 */
export const readImageAttachmentTool = tool({
  name: "read_image_attachment",
  description:
    "Loads an image attachment (from local workspace file path or base64 data) and passes the image to the multimodal model for visual analysis, OCR, design review, or bug diagnosis.",
  inputSchema: z.object({
    filePath: z.string().optional().describe("Local file path to the image attachment"),
    base64: z.string().optional().describe("Raw base64-encoded image string"),
    format: z.enum(["png", "jpg", "jpeg", "webp", "gif"]).optional().describe("Image format (defaults to auto-detected or png)"),
    description: z.string().optional().describe("Contextual description of what this image represents"),
  }),
  callback: async (input, _context?: ToolContext) => {
    let bytes: Uint8Array;
    let format: ImageFormat = (input.format as ImageFormat) || "png";

    if (input.filePath) {
      const resolvedPath = resolveContainedPath(TOOL_PATH_ROOT, input.filePath);
      const fileBuffer = await fs.readFile(resolvedPath);
      bytes = new Uint8Array(fileBuffer);
      if (!input.format) {
        format = detectImageFormat(resolvedPath);
      }
    } else if (input.base64) {
      const rawBase64 = input.base64.replace(/^data:image\/[a-z]+;base64,/, "");
      const buffer = Buffer.from(rawBase64, "base64");
      bytes = new Uint8Array(buffer);
    } else {
      throw new Error("read_image_attachment requires either 'filePath' or 'base64'");
    }

    const imageBlock = new ImageBlock({
      format,
      source: {
        bytes,
      },
    });

    const infoText = new TextBlock(
      `IMAGE_ATTACHMENT_LOADED: Read ${bytes.length} bytes of image format "${format}". ${input.description ? `Context: ${input.description}` : ""}`
    );

    // Returning array of [TextBlock, ImageBlock] provides both context text and raw image to the model
    return [infoText, imageBlock] as any;
  },
});
