import test from "node:test";
import assert from "node:assert/strict";
import {
  EXECUTION_REQUIREMENTS_VERSION,
  RESEARCHER_WORKFLOW_ID,
  researcherExecutionRequirements,
  type ExecutionRequirements,
} from "../../agents/researcher/execution-requirements.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { PythonBridge } from "../../validation/python-bridge.js";

test("researcherExecutionRequirements declares tool-use and structured-output", () => {
  const e = researcherExecutionRequirements("disabled");
  assert.equal(e.workflowId, "researcher");
  assert.equal(e.version, "1");
  assert.deepEqual(
    [...e.requirements.requiredCapabilities].sort(),
    ["structured-output", "tool-use"],
  );
  assert.equal(e.requirements.requiresToolUse, true);
  assert.equal(e.requirements.requiresStructuredOutput, true);
});

test("researcherExecutionRequirements prefers openai-chat transport", () => {
  const e = researcherExecutionRequirements();
  assert.deepEqual(e.requirements.preferredTransports, ["openai-chat"]);
});

test("researcherExecutionRequirements carries no credentials or concrete provider/model", () => {
  const e: ExecutionRequirements = researcherExecutionRequirements("external");
  assert.equal(Object.hasOwn(e, "apiKey"), false);
  assert.equal(Object.hasOwn(e.requirements, "apiKey"), false);
  assert.equal(Object.hasOwn(e, "providerId"), false);
  assert.equal(Object.hasOwn(e, "modelId"), false);
  assert.equal(Object.hasOwn(e.requirements, "providerId"), false);
});

test("researcherExecutionRequirements passes the research mode through", () => {
  const modes = ["disabled", "local-only", "external", "hybrid"] as const;
  for (const m of modes) {
    assert.equal(researcherExecutionRequirements(m).requirements.researchMode, m);
  }
});

test("ExecutionRequirements is versioned and timestamped", () => {
  const e = researcherExecutionRequirements();
  assert.equal(e.version, EXECUTION_REQUIREMENTS_VERSION);
  assert.equal(e.workflowId, RESEARCHER_WORKFLOW_ID);
  assert.ok(typeof e.generatedAt === "string" && e.generatedAt.length > 0);
});

test("ResearcherWorkflow.executionRequirements() describes demands without running", () => {
  // Construction mirrors integration-package-runtime.test.ts; the method does
  // not invoke run() or contracts, so no Python/external call occurs.
  const bridge = new PythonBridge();
  const contracts = new CanonicalContractSkill(bridge);
  const researcher = new ResearcherWorkflow(contracts);
  const e = researcher.executionRequirements();
  assert.equal(e.workflowId, "researcher");
  assert.equal(e.version, "1");
  assert.equal(e.requirements.requiresToolUse, true);
  assert.equal(e.requirements.requiresStructuredOutput, true);
  assert.deepEqual(e.requirements.preferredTransports, ["openai-chat"]);
  assert.deepEqual(
    [...e.requirements.requiredCapabilities].sort(),
    ["structured-output", "tool-use"],
  );
});
