import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { httpJsonRequest } from "../../integration/transport/http-request.js";

test("mock server serves /models with the configured model ids", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1", "m2"]);
  try {
    const res = await httpJsonRequest(`${srv.url}/models`);
    const body = (await res.json()) as { data: { id: string }[] };
    assert.deepEqual(
      body.data.map((m) => m.id),
      ["m1", "m2"],
    );
  } finally {
    await srv.close();
  }
});

test("mock server completes /chat/completions with non-empty content", async () => {
  const srv = await startOpenAICompatibleMockServer();
  try {
    const res = await httpJsonRequest(`${srv.url}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "mock-model-1",
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    const body = (await res.json()) as {
      choices: { message: { content: string }; finish_reason: string }[];
    };
    assert.ok(body.choices[0].message.content.length > 0);
    assert.equal(body.choices[0].finish_reason, "stop");
  } finally {
    await srv.close();
  }
});

test("mock server records request traces and returns 404 for unknown paths", async () => {
  const srv = await startOpenAICompatibleMockServer();
  try {
    const res = await httpJsonRequest(`${srv.url}/unknown`);
    assert.equal(res.status, 404);
    assert.ok(srv.requests.some((r) => r.path.endsWith("/unknown")));
  } finally {
    await srv.close();
  }
});

