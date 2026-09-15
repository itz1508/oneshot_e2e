import test from "node:test";
import assert from "node:assert/strict";
import { createEndpointHealthProbe } from "../../integration/endpoint/health-probe.js";

test("health probe returns unreachable on a URL-validation failure", async () => {
  const probe = createEndpointHealthProbe();
  const h = await probe.probe({ endpointId: "ep1", url: "not a url" });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /invalid url/);
});

test("health probe blocks a metadata endpoint without connecting", async () => {
  const probe = createEndpointHealthProbe();
  const h = await probe.probe({
    endpointId: "ep1",
    url: "http://169.254.169.254/latest/meta-data/",
  });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /metadata host blocked/);
});

test("health probe blocks a disallowed port without connecting", async () => {
  const probe = createEndpointHealthProbe();
  const h = await probe.probe({ endpointId: "ep1", url: "http://example.com:22/v1" });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /port not allowed/);
});

test("health probe times out when the endpoint does not respond", async () => {
  const probe = createEndpointHealthProbe({
    // An HTTP client that never resolves — simulates a hung endpoint.
    httpGet: () => new Promise(() => {}),
  });
  const h = await probe.probe({
    endpointId: "ep1",
    url: "http://127.0.0.1:11434/v1",
    timeoutMs: 40,
  });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /timeout/);
  assert.equal(h.latencyMs, 40);
});

test("health probe reports unreachable when the HTTP client errors", async () => {
  const probe = createEndpointHealthProbe({
    httpGet: () =>
      Promise.resolve({
        reachable: false,
        status: 0,
        latencyMs: 1,
        error: "ECONNREFUSED",
      }),
  });
  const h = await probe.probe({ endpointId: "ep1", url: "http://127.0.0.1:11434/v1" });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /ECONNREFUSED/);
});

test("health probe blocks a DNS rebinding to a metadata IP", async () => {
  const probe = createEndpointHealthProbe({
    // A hostname that "resolves" to the AWS metadata IP.
    dnsResolve: async () => ["169.254.169.254"],
  });
  const h = await probe.probe({ endpointId: "ep1", url: "http://example.invalid/v1" });
  assert.equal(h.reachable, false);
  assert.match(h.probeError ?? "", /dns resolved to metadata ip/);
  assert.equal(h.dnsResolved, true);
});
