import test from "node:test";
import assert from "node:assert/strict";
import {
  createHeaderAllowlist,
  HeaderNotAllowedError,
  isForbiddenHeaderName,
} from "../../security/header-allowlist.js";

test("forbidden header names are blocked (case-insensitive)", () => {
  const forbidden = [
    "Authorization",
    "authorization",
    "AUTHORIZATION",
    "X-API-Key",
    "x-api-key",
    "Host",
    "host",
    "Cookie",
    "cookie",
    "Set-Cookie",
    "Connection",
    "Keep-Alive",
    "Proxy-Authorization",
    "proxy-anything",
    "Transfer-Encoding",
    "Upgrade",
    "X-Forwarded-For",
    "Forwarded",
    "Content-Type",
    "Content-Length",
  ];
  for (const name of forbidden) {
    assert.equal(isForbiddenHeaderName(name), true, `${name} should be forbidden`);
  }
  assert.equal(isForbiddenHeaderName("X-Custom-Header"), false);
  assert.equal(isForbiddenHeaderName("x-custom-header"), false);
});

test("validate rejects a forbidden custom header with HEADER_NOT_ALLOWED listing safe names only", () => {
  const allow = createHeaderAllowlist(["X-Custom-Header", "X-Trace-Id"]);
  assert.throws(
    () => allow.validate({ Authorization: "Bearer x" }),
    (e: unknown) => {
      assert.ok(e instanceof HeaderNotAllowedError);
      assert.match(e.message, /HEADER_NOT_ALLOWED/);
      const safe = (e as HeaderNotAllowedError).safeNames;
      assert.ok(safe.includes("x-custom-header"));
      assert.ok(safe.includes("x-trace-id"));
      assert.ok(!safe.includes("authorization"));
      return true;
    },
  );
});

test("validate accepts permitted custom headers (case-insensitive) and lowercases names", () => {
  const allow = createHeaderAllowlist(["X-Custom-Header"]);
  const out = allow.validate({ "X-CUSTOM-HEADER": "v" });
  assert.deepEqual(out, { "x-custom-header": "v" });
});

test("validate rejects a header not in the provider allowlist (fail-closed)", () => {
  const allow = createHeaderAllowlist(["X-Custom-Header"]);
  assert.throws(() => allow.validate({ "X-Unknown": "v" }));
});

test("an empty provider allowlist rejects all custom headers", () => {
  const allow = createHeaderAllowlist([]);
  assert.throws(() => allow.validate({ "X-Anything": "v" }));
});

test("a provider cannot widen into a forbidden name", () => {
  const allow = createHeaderAllowlist([
    "Authorization",
    "Host",
    "X-Custom-Header",
  ]);
  assert.deepEqual([...allow.permittedNames()], ["x-custom-header"]);
});
