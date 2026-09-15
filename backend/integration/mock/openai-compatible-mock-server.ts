import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

/**
 * Minimal OpenAI-compatible mock HTTP server (M5). Implements `GET /models`
 * and `POST /chat/completions` against the OpenAI-compatible shape. Runs on
 * loopback (127.0.0.1) on an ephemeral port. TEST ONLY — never used in
 * production paths. No external calls are made; the server is local.
 *
 * Every response sends `Connection: close` so sockets close naturally after
 * each response (no keep-alive pooling). This avoids a Windows libuv
 * UV_HANDLE_CLOSING assertion that fires when manually destroyed socket
 * handles race with event-loop teardown. `close()` only unrefs the listener;
 * `--test-force-exit` reclaims the port at process end.
 */

export interface MockRequestTrace {
  readonly method: string;
  readonly path: string;
}

export interface MockServer {
  readonly url: string;
  readonly requests: MockRequestTrace[];
  close(): Promise<void>;
}

export interface MockServerOptions {
  /** Content returned in the assistant message for /chat/completions. */
  readonly chatContent?: string;
  /** If set, the assistant message includes these tool_calls (OpenAI shape). */
  readonly toolCalls?: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }>;
}

export function startOpenAICompatibleMockServer(
  models: readonly string[] = ["mock-model-1", "mock-model-2"],
  opts: MockServerOptions = {},
): Promise<MockServer> {
  const requests: MockRequestTrace[] = [];
  const server = createServer((req, res) => {
    const path = req.url ?? "/";
    requests.push({ method: req.method ?? "GET", path });
    res.setHeader("content-type", "application/json");
    res.setHeader("connection", "close");
    if (path.endsWith("/models") && req.method === "GET") {
      res.end(
        JSON.stringify({
          data: models.map((id) => ({ id, object: "model" })),
        }),
      );
      return;
    }
    if (path.endsWith("/chat/completions") && req.method === "POST") {
      const message: {
        role: "assistant";
        content: string;
        tool_calls?: unknown[];
      } = {
        role: "assistant",
        content: opts.chatContent ?? "mock chat completion",
      };
      const hasTools = Boolean(opts.toolCalls && opts.toolCalls.length > 0);
      if (hasTools) message.tool_calls = opts.toolCalls;
      res.end(
        JSON.stringify({
          choices: [
            {
              index: 0,
              message,
              finish_reason: hasTools ? "tool_calls" : "stop",
            },
          ],
          model: "mock-model-1",
        }),
      );
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${addr.port}`,
        requests,
        // Proven close pattern used across the existing HTTP test suite
        // (workspace-http, conversation-routing, intent-http, ...): close the
        // listener cleanly before process exit. Responses send
        // `Connection: close` so no keep-alive sockets linger.
        close: () =>
          new Promise<void>((ok, fail) => {
            // Forcibly close any lingering connections, then close the
            // listener. Combined with `Connection: close` responses and
            // `agent: false` on the client, this keeps teardown clean under
            // --test-force-exit on Windows.
            server.closeAllConnections();
            server.close((error) => (error ? fail(error) : ok()));
          }),
      });
    });
  });
}


