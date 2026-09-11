import test from "node:test";
import assert from "node:assert/strict";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { WorkflowInformationRequiredError } from "../../core/information-required-error.js";
import { harness, prompt } from "./harness.js";

import type { StructuredResearchDraft } from "../../agents/researcher/structured-draft.js";

class NeedUserInfo {
  async generateDraft(_p: Prompt): Promise<StructuredResearchDraft> {
    throw new WorkflowInformationRequiredError(
      {
        issue: "Additional information required",
        expected: "User-owned target environment is known",
        actual: "Target environment was not supplied",
        evidence_ids: [],
        required_correction: "Ask user for target environment",
        recheck_target: "run:need-help",
      },
      {
        request_id: "help:test",
        reason: "target environment missing",
        question: "Which target environment should this run use?",
        required_information: ["target_environment"],
        source_processor: "Researcher",
        prompt_revision_required: true,
      },
    );
  }
}

test("runtime ROOT CAUSE preserves targeted help request without recovery loop", async () => {
  const h = await harness("need-help", new NeedUserInfo());
  const runId = "run:need-help";
  h.runs.create(runId);
  const out = await h.runtime.run(runId, prompt(runId));
  assert.equal(out.test_result, "Failed");
  assert.equal(out.issue_type, "Root Cause");
  assert.equal(out.help_request?.request_id, "help:test");
  assert.equal(out.help_request?.source_processor, "Researcher");
  assert.ok(
    out.events.some(
      (e) =>
        e.scope === "SUPPORT" &&
        e.processor === "HelpRequest" &&
        e.test_result === "Failed" &&
        e.issue_type === "Root Cause",
    ),
  );
  assert.equal(
    out.events.filter((e) => e.processor === "Researcher" && e.execution_status === "Running")
      .length,
    1,
  );
  h.bridge.close();
});
