import type { IncomingMessage, ServerResponse } from "node:http";
import { extname } from "node:path";

export async function body(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}

export function json(
  res: ServerResponse,
  status: number,
  value: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
export const mime = (p: string) =>
  MIME[extname(p)] || "application/octet-stream";
