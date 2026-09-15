import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

/**
 * Minimal HTTP/HTTPS JSON request helper (M5). Uses Node's built-in
 * `http`/`https` modules (NOT global `fetch`/undici) to avoid a Windows
 * libuv `uv_async` assertion that fires when `--test-force-exit` tears down
 * undici's internal async handle. This matches the codebase's existing HTTP
 * test pattern.
 */

export interface HttpRequestInit {
  readonly method?: string;
  readonly headers?: Record<string, string>;
  readonly body?: string;
  readonly timeoutMs?: number;
}

export interface HttpRequestResult {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
  json(): Promise<unknown>;
}

export function httpJsonRequest(
  url: string,
  init: HttpRequestInit = {},
): Promise<HttpRequestResult> {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? httpsRequest : httpRequest;
    const req = lib(
      url,
      {
        method: init.method ?? "GET",
        headers: init.headers ?? {},
        // Disable the global keep-alive agent: each request uses a fresh
        // socket that closes after the response, so no client sockets linger
        // in a pool at process exit (avoids a Windows libuv UV_HANDLE_CLOSING
        // assertion under --test-force-exit).
        agent: false,
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const body = buf.toString("utf8");
          const status = res.statusCode ?? 0;
          resolve({
            ok: status >= 200 && status < 300,
            status,
            text: () => Promise.resolve(body),
            json: () => Promise.resolve(JSON.parse(body)),
          });
        });
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    if (init.timeoutMs) {
      req.setTimeout(init.timeoutMs, () =>
        req.destroy(new Error("request timeout")),
      );
    }
    if (init.body !== undefined) req.write(init.body);
    req.end();
  });
}
