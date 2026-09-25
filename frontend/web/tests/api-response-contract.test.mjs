import { describe, it } from "node:test";
import assert from "node:assert/strict";

const {
  ApiResponseError,
  readJsonResponse,
  checkBackendHealth,
  iterateAgentStream,
  resolveApiUrl,
  resolveBackendBaseUrl,
} = await import("../src/lib/api.ts");

const JSON_HEADERS = { "content-type": "application/json" };
const SSE_HEADERS = { "content-type": "text/event-stream" };

/** Replaces global fetch for one test and returns a restore function. */
function stubFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

/** Builds one real AG-UI SSE frame: "event: <TYPE>\ndata: <json>\n\n". */
function agUiFrame(type, payload) {
  const event = { type, timestamp: new Date(2026, 8, 24, 12, 0, 0).toISOString(), ...payload };
  return `event: ${type}\ndata: ${JSON.stringify(event)}\n\n`;
}

/** Delivers an SSE body through a ReadableStream split at fixed byte boundaries. */
function streamResponse(text, chunkSize) {
  const bytes = new TextEncoder().encode(text);
  const body = new ReadableStream({
    start(controller) {
      for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        controller.enqueue(bytes.subarray(offset, offset + chunkSize));
      }
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: SSE_HEADERS });
}

async function collectAgentEvents(prompt, providerConfig, sessionId) {
  const events = [];
  for await (const event of iterateAgentStream(prompt, undefined, providerConfig, sessionId)) {
    events.push(event);
  }
  return events;
}

describe("Backend base URL resolution (Vercel split deployment)", () => {
  it("keeps same-origin relative URLs when NEXT_PUBLIC_BACKEND_URL is unset", () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    assert.strictEqual(resolveBackendBaseUrl(), "");
    assert.strictEqual(resolveApiUrl("/api/health"), "/api/health");
    assert.strictEqual(resolveApiUrl("api/health"), "/api/health");
  });

  it("prefixes API paths and trims trailing slashes when configured", () => {
    process.env.NEXT_PUBLIC_BACKEND_URL = "https://api.example.com/";
    try {
      assert.strictEqual(resolveBackendBaseUrl(), "https://api.example.com");
      assert.strictEqual(resolveApiUrl("/api/health"), "https://api.example.com/api/health");
      assert.strictEqual(resolveApiUrl("/api/agent/stream"), "https://api.example.com/api/agent/stream");
      assert.strictEqual(resolveApiUrl("https://other.example.com/api/health"), "https://other.example.com/api/health");
    } finally {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
    }
  });
});

describe("Strict JSON response contract (readJsonResponse)", () => {
  it("returns the parsed payload for a JSON 200 response", async () => {
    const response = new Response(JSON.stringify({ ok: true, value: 7 }), {
      status: 200,
      headers: JSON_HEADERS,
    });

    const data = await readJsonResponse(response, "Unit contract request");
    assert.deepEqual(data, { ok: true, value: 7 });
  });

  it("rejects a 200 response whose content-type is not JSON", async () => {
    const response = new Response("<html>ok</html>", {
      status: 200,
      headers: { "content-type": "text/html" },
    });

    await assert.rejects(readJsonResponse(response, "Health request"), (error) => {
      assert.ok(error instanceof ApiResponseError, "Must be an ApiResponseError");
      assert.strictEqual(error.status, 200);
      assert.match(error.message, /non-JSON/);
      return true;
    });
  });

  it("rejects a JSON content-type response whose body is unparseable", async () => {
    const response = new Response("{ \"ok\": ", { status: 200, headers: JSON_HEADERS });

    await assert.rejects(readJsonResponse(response, "Health request"), (error) => {
      assert.ok(error instanceof ApiResponseError);
      assert.strictEqual(error.status, 200);
      assert.match(error.message, /invalid JSON/);
      return true;
    });
  });

  it("rejects a non-2xx response and surfaces the server error message", async () => {
    const payload = { error: "provider and apiKey are required" };
    const response = new Response(JSON.stringify(payload), { status: 400, headers: JSON_HEADERS });

    await assert.rejects(readJsonResponse(response, "Configure provider"), (error) => {
      assert.ok(error instanceof ApiResponseError);
      assert.strictEqual(error.status, 400);
      assert.strictEqual(error.message, "provider and apiKey are required");
      assert.deepEqual(error.payload, payload);
      return true;
    });
  });

  it("rejects a non-2xx response without an error field using the HTTP status", async () => {
    const response = new Response(JSON.stringify({ detail: "nope" }), { status: 502, headers: JSON_HEADERS });

    await assert.rejects(readJsonResponse(response, "Provider status request"), (error) => {
      assert.ok(error instanceof ApiResponseError);
      assert.strictEqual(error.status, 502);
      assert.match(error.message, /failed with HTTP 502/);
      return true;
    });
  });
});

describe("Backend health contract (checkBackendHealth)", () => {
  it("reports unhealthy when the payload omits ok=true", async () => {
    const restore = stubFetch(async () =>
      new Response(JSON.stringify({ status: "healthy" }), { status: 200, headers: JSON_HEADERS })
    );
    try {
      const health = await checkBackendHealth();
      assert.strictEqual(health.ok, false);
      assert.match(health.status, /missing ok=true/);
    } finally {
      restore();
    }
  });

  it("reports healthy only for a real ok=true + status payload", async () => {
    const restore = stubFetch(async () =>
      new Response(JSON.stringify({ ok: true, status: "healthy" }), { status: 200, headers: JSON_HEADERS })
    );
    try {
      const health = await checkBackendHealth();
      assert.deepEqual(health, { ok: true, status: "healthy" });
    } finally {
      restore();
    }
  });

  it("surfaces the server error body instead of claiming reachability", async () => {
    const restore = stubFetch(async () =>
      new Response(JSON.stringify({ error: "database offline" }), { status: 500, headers: JSON_HEADERS })
    );
    try {
      const health = await checkBackendHealth();
      assert.strictEqual(health.ok, false);
      assert.strictEqual(health.status, "database offline");
    } finally {
      restore();
    }
  });
});

describe("Strict AG-UI SSE stream contract (iterateAgentStream)", () => {
  const providerConfig = {
    provider: "gemini",
    config: { key: "", model: "gemini-2.5-pro", baseUrl: "", temperature: "0.4", configured: true },
  };

  it("reassembles a fragmented stream and sends provider + X-Session-Id", async () => {
    const sse =
      agUiFrame("RUN_START", { runId: "run-1", agentName: "OneShot Strands Agent" }) +
      agUiFrame("TEXT_MESSAGE_DELTA", { runId: "run-1", delta: "Hello " }) +
      agUiFrame("TEXT_MESSAGE_DELTA", { runId: "run-1", delta: "world" }) +
      agUiFrame("RUN_FINISH", { runId: "run-1", status: "COMPLETED" });

    let captured = null;
    const restore = stubFetch(async (url, init) => {
      captured = { url, init };
      return streamResponse(sse, 7);
    });

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");

      assert.deepEqual(
        events.map((event) => event.type),
        ["lifecycle", "data", "data", "lifecycle"]
      );
      assert.strictEqual(events[0].lifecycle, "beforeInvocationEvent");
      assert.strictEqual(events[0].runId, "run-1");
      assert.strictEqual(events[1].data, "Hello ");
      assert.strictEqual(events[2].data, "world");
      assert.strictEqual(events[3].lifecycle, "afterInvocationEvent");

      assert.strictEqual(captured.url, "/api/agent/stream");
      assert.strictEqual(captured.init.method, "POST");
      assert.strictEqual(captured.init.headers["X-Session-Id"], "sess-42");
      assert.strictEqual(captured.init.headers.Accept, "text/event-stream");
      const body = JSON.parse(captured.init.body);
      assert.strictEqual(body.prompt, "hello");
      assert.strictEqual(body.provider, "gemini");
      assert.strictEqual(body.model, "gemini-2.5-pro");
    } finally {
      restore();
    }
  });

  it("parses a final frame that arrives without a trailing blank line", async () => {
    const finalFrame = `event: RUN_FINISH\ndata: ${JSON.stringify({
      type: "RUN_FINISH",
      runId: "run-2",
      timestamp: new Date(2026, 8, 24, 12, 0, 0).toISOString(),
      status: "COMPLETED",
    })}`;

    const restore = stubFetch(async () =>
      streamResponse(agUiFrame("RUN_START", { runId: "run-2" }) + finalFrame, 4096)
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.deepEqual(
        events.map((event) => event.type),
        ["lifecycle", "lifecycle"]
      );
    } finally {
      restore();
    }
  });

  it("fails the stream when RUN_FINISH never arrives", async () => {
    const restore = stubFetch(async () =>
      streamResponse(
        agUiFrame("RUN_START", { runId: "run-3" }) +
          agUiFrame("TEXT_MESSAGE_DELTA", { runId: "run-3", delta: "partial" }),
        4096
      )
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      const last = events.at(-1);
      assert.strictEqual(last.type, "error");
      assert.match(last.error, /without the required lifecycle/);
      assert.match(last.error, /runFinish=false/);
    } finally {
      restore();
    }
  });

  it("rejects malformed JSON inside a data line", async () => {
    const restore = stubFetch(async () => streamResponse("event: RUN_START\ndata: {oops}\n\n", 4096));

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, "error");
      assert.match(events[0].error, /invalid RUN_START event/);
    } finally {
      restore();
    }
  });

  it("rejects an event envelope missing type/runId/timestamp", async () => {
    const restore = stubFetch(async () =>
      streamResponse('event: RUN_START\ndata: {"type":"RUN_START"}\n\n', 4096)
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events[0].type, "error");
      assert.match(events[0].error, /missing its type\/runId\/timestamp contract/);
    } finally {
      restore();
    }
  });

  it("rejects a runId that does not correlate with RUN_START", async () => {
    const restore = stubFetch(async () =>
      streamResponse(
        agUiFrame("RUN_START", { runId: "run-4" }) +
          agUiFrame("TEXT_MESSAGE_DELTA", { runId: "run-999", delta: "drift" }),
        4096
      )
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events.at(-1).type, "error");
      assert.match(events.at(-1).error, /correlation mismatch/);
    } finally {
      restore();
    }
  });

  it("rejects an event emitted before RUN_START", async () => {
    const restore = stubFetch(async () =>
      streamResponse(agUiFrame("TEXT_MESSAGE_DELTA", { runId: "run-5", delta: "early" }), 4096)
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events[0].type, "error");
      assert.match(events[0].error, /before RUN_START/);
    } finally {
      restore();
    }
  });

  it("rejects unsupported event types instead of silently ignoring them", async () => {
    const restore = stubFetch(async () =>
      streamResponse(
        agUiFrame("RUN_START", { runId: "run-6" }) +
          agUiFrame("PROVIDER_TELEMETRY", { runId: "run-6", cpu: 42 }),
        4096
      )
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events.at(-1).type, "error");
      assert.match(events.at(-1).error, /unsupported event PROVIDER_TELEMETRY/);
    } finally {
      restore();
    }
  });

  it("rejects a run that finishes with an incomplete tool call", async () => {
    const restore = stubFetch(async () =>
      streamResponse(
        agUiFrame("RUN_START", { runId: "run-7" }) +
          agUiFrame("TOOL_CALL_START", {
            runId: "run-7",
            toolName: "web_search",
            toolUseId: "tool-1",
            parameters: { query: "contracts" },
          }) +
          agUiFrame("RUN_FINISH", { runId: "run-7", status: "COMPLETED" }),
        4096
      )
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.deepEqual(
        events.map((event) => event.type),
        ["lifecycle", "tool_use", "error"]
      );
      assert.strictEqual(events[1].tool.name, "web_search");
      assert.match(events[2].error, /incomplete tool call/);
    } finally {
      restore();
    }
  });

  it("surfaces RUN_FINISH status FAILED as a real error", async () => {
    const restore = stubFetch(async () =>
      streamResponse(
        agUiFrame("RUN_START", { runId: "run-8" }) +
          agUiFrame("RUN_FINISH", { runId: "run-8", status: "FAILED", error: "provider exploded" }),
        4096
      )
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.deepEqual(
        events.map((event) => event.type),
        ["lifecycle", "error", "lifecycle"]
      );
      assert.match(events[1].error, /provider exploded/);
    } finally {
      restore();
    }
  });

  it("reports an actionable error for HTTP 503 instead of fabricating content", async () => {
    const restore = stubFetch(async () =>
      new Response(JSON.stringify({ error: "no server credentials" }), { status: 503, headers: JSON_HEADERS })
    );

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, "error");
      assert.match(events[0].error, /503/);
      assert.match(events[0].error, /Credentials remain server-side/);
    } finally {
      restore();
    }
  });

  it("reports a transport failure as an error event, not an empty success", async () => {
    const restore = stubFetch(async () => {
      throw new Error("ECONNREFUSED 127.0.0.1:8787");
    });

    try {
      const events = await collectAgentEvents("hello", providerConfig, "sess-42");
      assert.strictEqual(events.length, 1);
      assert.strictEqual(events[0].type, "error");
      assert.match(events[0].error, /ECONNREFUSED/);
    } finally {
      restore();
    }
  });
});
