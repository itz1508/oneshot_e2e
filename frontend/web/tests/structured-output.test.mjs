import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractStructuredOutput,
  validateFields,
  getStructuredFallbackText,
} from "../src/lib/structured-output.ts";

describe("LangChain Structured Output Frontend Best Practices", () => {
  it("Validates before rendering by checking required fields", () => {
    const completeData = { title: "Research Summary", status: "CONFIRMED", count: 5 };
    assert.ok(validateFields(completeData, ["title", "status"]));
    assert.strictEqual(validateFields(completeData, ["title", "missingField"]), false);

    const partialData = { title: "Partial" };
    assert.strictEqual(validateFields(partialData, ["title", "status"]), false);
  });

  it("Uses generic extraction function across different schemas", () => {
    const jsonStr = JSON.stringify({ title: "Deep Research", confidence: 0.95 });
    const extracted = extractStructuredOutput(jsonStr, ["title"]);
    assert.ok(extracted);
    assert.strictEqual(extracted.title, "Deep Research");
    assert.strictEqual(extracted.confidence, 0.95);

    // Rejects when required field is missing
    const missing = extractStructuredOutput(jsonStr, ["title", "nonexistent"]);
    assert.strictEqual(missing, null);
  });

  it("Renders progressively by parsing incomplete streaming JSON deltas", () => {
    // Partial streaming chunk missing closing brace
    const partialStreamChunk = '{"title":"Streaming in progress","stage":"research"';
    const recovered = extractStructuredOutput(partialStreamChunk, ["title"]);
    assert.ok(recovered);
    assert.strictEqual(recovered.title, "Streaming in progress");
    assert.strictEqual(recovered.stage, "research");

    // Partial streaming chunk with unclosed string
    const unclosedStringChunk = '{"title":"Streaming partial';
    const recoveredString = extractStructuredOutput(unclosedStringChunk, ["title"]);
    assert.ok(recoveredString);
    assert.strictEqual(recoveredString.title, "Streaming partial");

    // Markdown code fence wrapped JSON
    const fencedJson = '```json\n{"status":"CONFIRMED","title":"Fenced Plan"}\n```';
    const recoveredFenced = extractStructuredOutput(fencedJson, ["status", "title"]);
    assert.ok(recoveredFenced);
    assert.strictEqual(recoveredFenced.status, "CONFIRMED");
    assert.strictEqual(recoveredFenced.title, "Fenced Plan");
  });

  it("Provides plain-text fallback representation", () => {
    assert.strictEqual(getStructuredFallbackText({ summary: "Simple summary text" }), "Simple summary text");
    assert.strictEqual(getStructuredFallbackText({ content: "Direct content text" }), "Direct content text");
    assert.strictEqual(getStructuredFallbackText({ title: "Title only" }), "Title only");
  });
});
