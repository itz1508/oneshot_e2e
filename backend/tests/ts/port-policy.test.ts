import test from "node:test";
import assert from "node:assert/strict";
import { createPortPolicy } from "../../integration/endpoint/port-policy.js";

test("port policy allows well-known web ports and non-privileged ports", () => {
  const p = createPortPolicy();
  for (const port of [80, 443, 1024, 11434, 8080, 50000]) {
    assert.equal(p.isAllowed(port), true, `port ${port} should be allowed`);
  }
});

test("port policy denies privileged non-web ports", () => {
  const p = createPortPolicy();
  for (const port of [0, 1, 22, 25, 808, 1023]) {
    assert.equal(p.isAllowed(port), false, `port ${port} should be denied`);
  }
});

test("port policy denies non-integers and out-of-range ports", () => {
  const p = createPortPolicy();
  assert.equal(p.isAllowed(-1), false);
  assert.equal(p.isAllowed(1.5), false);
  assert.equal(p.isAllowed(NaN), false);
});
