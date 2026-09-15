import test from "node:test";
import assert from "node:assert/strict";
import {
  createTavilyResearchTool,
  createEvidenceRecorder,
} from "../../agents/researcher/strands-tools.js";

test("Tavily Live Search & Extract Verification", async (t) => {
  // Gap 11 guard: ordinary `npm test` must never call paid/external providers.
  // Live Tavily calls are opt-in via RUN_LIVE_TAVILY_TESTS=true.
  const liveEnabled = process.env.RUN_LIVE_TAVILY_TESTS === "true";
  if (!liveEnabled) {
    t.skip("Live Tavily test skipped: set RUN_LIVE_TAVILY_TESTS=true to enable live Tavily calls");
    return;
  }

  const apiKey = (process.env.TAVILY_API_KEY || "").trim();
  assert.ok(
    apiKey.length > 0,
    "TAVILY_API_KEY must be configured in environment or app/env/.env for live test",
  );

  const recorder = createEvidenceRecorder();
  const tool = createTavilyResearchTool(apiKey, undefined, recorder);
  assert.equal(tool.name, "tavily_search_extract");

  // Execute live search & extract via tool
  const output = await tool.invoke({
    query: "TypeScript strict ESM architectural best practices",
    maxResults: 2,
  });

  assert.ok(typeof output === "string", "Tool must return a string output");
  assert.ok(output.length > 0, "Tool output must not be empty");

  const gatheredEvidence = recorder.list();

  // 1. Search returned at least one result
  const searchEvidence = gatheredEvidence.filter(
    (e) => e.provenance === "tavily-search",
  );
  assert.ok(
    searchEvidence.length >= 1,
    `Expected at least 1 tavily-search evidence item, got ${searchEvidence.length}`,
  );

  // 2. Evidence includes the source URL
  for (const item of searchEvidence) {
    assert.ok(
      item.source.startsWith("http://") || item.source.startsWith("https://"),
      `Search evidence source must be a valid HTTP(S) URL, got ${item.source}`,
    );
    assert.ok(item.statement.length > 0, "Statement must not be empty");
  }

  // 3. At least one URL was submitted to Extract and Extract returned content
  const extractEvidence = gatheredEvidence.filter(
    (e) => e.provenance === "tavily-extract",
  );
  assert.ok(
    extractEvidence.length >= 1,
    `Expected at least 1 tavily-extract evidence item, got ${extractEvidence.length}`,
  );

  for (const item of extractEvidence) {
    assert.ok(
      item.source.startsWith("http://") || item.source.startsWith("https://"),
      `Extract evidence source must be a valid HTTP(S) URL, got ${item.source}`,
    );
    assert.ok(
      item.statement.length > 0,
      "Extract statement must contain content",
    );
  }

  // 4. Evidence distinguishes tavily-search from tavily-extract
  const provenances = new Set(gatheredEvidence.map((e) => e.provenance));
  assert.ok(
    provenances.has("tavily-search"),
    "Must contain tavily-search provenance",
  );
  assert.ok(
    provenances.has("tavily-extract"),
    "Must contain tavily-extract provenance",
  );

  // 5. No API key is written into logs, output, or evidence statements
  assert.ok(
    !output.includes(apiKey),
    "Tool string output must not leak TAVILY_API_KEY",
  );
  for (const item of gatheredEvidence) {
    assert.ok(
      !item.source.includes(apiKey),
      "Evidence source must not leak TAVILY_API_KEY",
    );
    assert.ok(
      !item.statement.includes(apiKey),
      "Evidence statement must not leak TAVILY_API_KEY",
    );
  }
});
