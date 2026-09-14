import test from "node:test";
import assert from "node:assert/strict";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";
import { resolveTransition } from "../../workflow/canonical-transition.js";
import {
  createWorkspaceEvidenceTool,
  createTavilyResearchTool,
} from "../../agents/researcher/strands-tools.js";

test("Strands Researcher Tools: workspace tool reads local file safely", async () => {
  const workspaceTool = createWorkspaceEvidenceTool(process.cwd());
  assert.equal(workspaceTool.name, "workspace_read_file");

  // Read a known file
  const content = await workspaceTool.invoke({ relativePath: "package.json" });
  assert.ok(typeof content === "string");
  assert.ok((content as string).includes("oneshot-production-e2e"));

  // Reject path traversal outside project root
  const forbidden = await workspaceTool.invoke({ relativePath: "../../../etc/passwd" });
  assert.ok(typeof forbidden === "string");
  assert.ok((forbidden as string).includes("Forbidden"));
});

test("Strands Researcher Tools: Tavily research tool handles unconfigured key gracefully", async () => {
  const tavilyTool = createTavilyResearchTool("");
  assert.equal(tavilyTool.name, "tavily_search_extract");

  const res = await tavilyTool.invoke({ query: "OneShot test query" });
  assert.ok(typeof res === "string");
  assert.ok((res as string).includes("Tavily API key not configured"));
});

test("Researcher Workflow: executes via harness and halts at Research Review (Human Gate 1)", async () => {
  const h = await harness("researcher-strands-workflow");
  const jobId = "job-researcher-strands-001";
  const testPrompt: Prompt = prompt(jobId);

  try {
    const bundle: ResearchBundle = await h.researcher.run(testPrompt, jobId);

    assert.ok(bundle, "Researcher produced no output");
    assert.equal(bundle.prompt.prompt_id, `prompt:${jobId}`);
    assert.equal(bundle.researcher.prompt_id, bundle.prompt.prompt_id);
    assert.equal(bundle.researcher.plan_id, bundle.plan.plan_id);
    assert.equal(bundle.researcher.schema_id, bundle.schema_artifact.schema_id);
    assert.equal(bundle.researcher.fixture_id, bundle.fixture.fixture_id);
    assert.equal(bundle.researcher.goal_id, bundle.goal.goal_id);
    assert.equal(bundle.researcher.validation_id, bundle.validation.validation_id);
    assert.ok(bundle.researcher.evidence.length > 0, "evidence must be recorded");
    assert.ok(bundle.researcher.success_definition.success_criteria_ids.length > 0);

    // Verify canonical transition halts at Research Review (Gate 1)
    const transition = resolveTransition("researcher", { kind: "advance", value: bundle }, 0);
    assert.deepEqual(
      transition,
      { type: "wait-human" },
      "Workflow must halt at Research Review gate before Planner can start",
    );
  } finally {
    h.close();
  }
});
