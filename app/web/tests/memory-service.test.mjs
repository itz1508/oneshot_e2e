import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

function sourceDigest(records) {
  const entries = records
    .map((r) => `${r.record_id}|${r.type_ids.join(",")}|${r.text}`)
    .join("\n");
  return createHash("sha256").update(entries).digest("hex");
}

test("source digest changes when type_ids change", () => {
  const r1 = { record_id: "r1", type_ids: ["goal"], text: "hello" };
  const r2 = { record_id: "r1", type_ids: ["goal", "requirement"], text: "hello" };
  assert.notEqual(sourceDigest([r1]), sourceDigest([r2]));
});

test("source digest is stable for identical records", () => {
  const r1 = { record_id: "r1", type_ids: ["goal"], text: "hello" };
  const r2 = { record_id: "r1", type_ids: ["goal"], text: "hello" };
  assert.equal(sourceDigest([r1]), sourceDigest([r2]));
});
