import test from "node:test";
import assert from "node:assert/strict";
import { createRuntimeRegistry } from "../../integration/runtime/registry.js";

test("runtime registry registers descriptors and rejects duplicates", () => {
  const r = createRuntimeRegistry();
  r.add({
    runtimeId: "strands",
    displayName: "Strands",
    supportedTransports: ["openai-chat"],
  });
  r.add({
    runtimeId: "fake",
    displayName: "Fake",
    supportedTransports: ["openai-chat", "native"],
  });
  assert.equal(r.list().length, 2);
  assert.equal(r.get("strands")?.displayName, "Strands");
  assert.equal(r.has("fake"), true);
  assert.equal(r.has("adk"), false);
  assert.throws(
    () =>
      r.add({
        runtimeId: "strands",
        displayName: "x",
        supportedTransports: [],
      }),
    /runtime already registered: strands/,
  );
});
