import test from "node:test";
import assert from "node:assert/strict";
import { createUrlValidator } from "../../integration/endpoint/url-validator.js";

test("url validator accepts valid http and https URLs", () => {
  const v = createUrlValidator();
  assert.equal(v.validate("http://localhost:11434/v1").ok, true);
  assert.equal(v.validate("https://api.example.com/v1").ok, true);
});

test("url validator infers default ports (80 http, 443 https) and reads explicit ones", () => {
  const v = createUrlValidator();
  assert.equal(v.validate("http://localhost/v1").port, 80);
  assert.equal(v.validate("https://example.com/v1").port, 443);
  assert.equal(v.validate("http://localhost:11434/v1").port, 11434);
});

test("url validator rejects non-http(s) protocols", () => {
  const v = createUrlValidator();
  for (const url of ["ftp://host/x", "file:///etc/passwd", "gopher://host/x"]) {
    const r = v.validate(url);
    assert.equal(r.ok, false);
    assert.match(r.reason ?? "", /protocol not allowed/);
  }
});

test("url validator rejects malformed URLs and missing hosts", () => {
  const v = createUrlValidator();
  assert.equal(v.validate("not a url").ok, false);
  assert.equal(v.validate("http://").ok, false);
});
