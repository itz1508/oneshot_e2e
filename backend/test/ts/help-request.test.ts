import test from "node:test";
import assert from "node:assert/strict";
import type { Prompt, ResearchBundle } from "../../contract/types.js";
import type { ResearchProvider } from "../../role/researcher/provider.js";
import { WorkflowInformationRequiredError } from "../../core/information-required-error.js";
import { harness, prompt } from "./harness.js";

class NeedUserInfo implements ResearchProvider {
  async research(_p: Prompt, runId: string): Promise<ResearchBundle> {
    throw new WorkflowInformationRequiredError(
      {
        issue: "Additional information required",
        expected: "User-owned target environment is known",
        actual: "Target environment was not supplied",
        evidence_ids: [],
        required_correction: "Ask user for target environment",
        recheck_target: runId,
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
  assert.equal(out.result, "ROOT_CAUSE");
  assert.equal(out.help_request?.request_id, "help:test");
  assert.equal(out.help_request?.source_processor, "Researcher");
  assert.ok(
    out.events.some(
      (e) =>
        e.scope === "SUPPORT" &&
        e.processor === "HelpRequest" &&
        e.result === "ROOT_CAUSE",
    ),
  );
  assert.equal(
    out.events.filter((e) => e.processor === "Researcher" && e.state === "RUNNING")
      .length,
    1,
  );
  h.bridge.close();
});
