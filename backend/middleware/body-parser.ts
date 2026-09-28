/**
 * OneShot Safe Request Body Parser
 * 
 * Protects against:
 * - Denial-of-Service (DoS) and Out-Of-Memory (OOM) via strict payload byte limits.
 * - Slowloris attacks via socket read timeout.
 */

import type http from "node:http";

export interface BodyParserOptions {
  maxBytes?: number;
  timeoutMs?: number;
}

export class PayloadTooLargeError extends Error {
  public statusCode = 413;
  constructor(limit: number) {
    super(`Payload Too Large: request body exceeds maximum allowed limit of ${limit} bytes`);
    this.name = "PayloadTooLargeError";
  }
}

export class BodyTimeoutError extends Error {
  public statusCode = 408;
  constructor(timeoutMs: number) {
    super(`Request Timeout: reading body exceeded timeout of ${timeoutMs}ms`);
    this.name = "BodyTimeoutError";
  }
}

export function parseJsonBody(
  req: http.IncomingMessage,
  options: BodyParserOptions = {}
): Promise<any> {
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024; // 10MB default
  const timeoutMs = options.timeoutMs ?? 30000;

  return new Promise((resolve, reject) => {
    let body = "";
    let receivedBytes = 0;
    let completed = false;

    const timer = setTimeout(() => {
      if (!completed) {
        completed = true;
        req.destroy();
        reject(new BodyTimeoutError(timeoutMs));
      }
    }, timeoutMs);

    req.on("data", (chunk: Buffer | string) => {
      if (completed) return;

      const chunkLength = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(chunk);
      receivedBytes += chunkLength;

      if (receivedBytes > maxBytes) {
        completed = true;
        clearTimeout(timer);
        req.destroy();
        reject(new PayloadTooLargeError(maxBytes));
        return;
      }

      body += chunk;
    });

    req.on("end", () => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);

      try {
        resolve(JSON.parse(body || "{}"));
      } catch (err) {
        reject(err);
      }
    });

    req.on("error", (err) => {
      if (completed) return;
      completed = true;
      clearTimeout(timer);
      reject(err);
    });
  });
}
