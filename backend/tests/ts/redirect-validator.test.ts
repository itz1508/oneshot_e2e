import test from "node:test";
import assert from "node:assert/strict";
import { createUrlValidator } from "../../integration/endpoint/url-validator.js";
import { createPortPolicy } from "../../integration/endpoint/port-policy.js";
import { validateRedirect } from "../../integration/endpoint/redirect-validator.js";

const validators = {
  url: createUrlValidator(),
  port: createPortPolicy(),
};

test("redirect validator rejects a redirect to a metadata IP", () => {
  const r = validateRedirect("http://169.254.169.254/latest/meta-data", validators);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /metadata host/);
});

test("redirect validator rejects a redirect to a non-http protocol", () => {
  const r = validateRedirect("ftp://evil.example/x", validators);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /protocol not allowed/);
});

test("redirect validator rejects a redirect to a disallowed port", () => {
  const r = validateRedirect("http://example.com:22/v1", validators);
  assert.equal(r.ok, false);
  assert.match(r.reason ?? "", /port not allowed/);
});

test("redirect validator accepts a redirect to a valid local endpoint", () => {
  const r = validateRedirect("http://127.0.0.1:11434/v1", validators);
  assert.equal(r.ok, true);
});
