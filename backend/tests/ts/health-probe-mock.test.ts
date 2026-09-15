import test from "node:test";
import assert from "node:assert/strict";
import { startOpenAICompatibleMockServer } from "../../integration/mock/openai-compatible-mock-server.js";
import { createEndpointHealthProbe } from "../../integration/endpoint/health-probe.js";
import { createLocalityDetector } from "../../integration/endpoint/locality-detector.js";

test("health probe reaches a loopback mock /models endpoint", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"]);
  try {
    const probe = createEndpointHealthProbe();
    const h = await probe.probe({
      endpointId: "ep-mock",
      url: `${srv.url}/models`,
      timeoutMs: 2000,
    });
    assert.equal(h.reachable, true);
    assert.equal(typeof h.latencyMs, "number");
    assert.ok((h.latencyMs ?? 0) >= 0);
    // The URL host is 127.0.0.1 → loopback.
    assert.equal(createLocalityDetector().detect(`${srv.url}/models`), "loopback");
  } finally {
    await srv.close();
  }
});

test("health probe follows a safe redirect and stays reachable", async () => {
  const srv = await startOpenAICompatibleMockServer(["m1"]);
  try {
    const probe = createEndpointHealthProbe({
      // First call returns a 302 to /models; second (followed) call returns 200.
      httpGet: (() => {
        let first = true;
        return (url: string) => {
          if (first) {
            first = false;
            return Promise.resolve({
              reachable: true,
              status: 302,
              latencyMs: 1,
              redirectLocation: `${srv.url}/models`,
            });
          }
          return Promise.resolve({
            reachable: true,
            status: 200,
            latencyMs: 1,
          });
        };
      })(),
    });
    const h = await probe.probe({
      endpointId: "ep-redir",
      url: `${srv.url}/old-models`,
      timeoutMs: 2000,
    });
    assert.equal(h.reachable, true);
    assert.ok(h.redirectChain?.some((x) => x.endsWith("/models")));
  } finally {
    await srv.close();
  }
});

test("health probe blocks a redirect to a metadata IP", async () => {
  const probe = createEndpointHealthProbe({
    httpGet: () =>
      Promise.resolve({
        reachable: true,
        status: 302,
        latencyMs: 1,
        redirectLocation: "http://169.254.169.254/latest/meta-data/",
      }),
  });
  const h = await probe.probe({
    endpointId: "ep-redir-evil",
    url: "http://127.0.0.1:11434/v1",
    timeoutMs: 2000,
  });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /redirect blocked/);
});
