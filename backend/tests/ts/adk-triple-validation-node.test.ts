import test from "node:test";
import assert from "node:assert/strict";
import { InMemoryRunner, node, type NodeContext, Workflow } from "@google/adk";
import type { ResearchBundle, TripleValidation } from "../../contracts/schema/types.js";
import { createTripleValidationNode } from "../../workflow/adk/node/triple-validation-node.js";
import { createResearcherNode } from "../../workflow/adk/node/researcher-node.js";
import { harness, prompt } from "./harness.js";

interface ProbeOutput {
  valid: TripleValidation;
  notValid: TripleValidation;
}

test("ADK runs Schema Fixture Goal validators in parallel and returns NOT_VALID as refinement signal", async () => {
  const h = await harness("adk-triple-validation-node");
  const jobId = "job-triple-001";
  const researcherNode = createResearcherNode(h.researcher);
  const tripleNode = createTripleValidationNode(h.triple);

  const probe = node(
    async (ctx: NodeContext): Promise<ProbeOutput> => {
      const research = (await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: prompt(jobId) },
        { runId: `${jobId}-researcher` },
      )).output as ResearchBundle;

      const valid = (await ctx.runNode(
        tripleNode,
        { job_id: `${jobId}-valid`, research, plan: research.plan },
        { runId: `${jobId}-triple-valid` },
      )).output as TripleValidation;

      const incompletePlan = structuredClone(research.plan);
      incompletePlan.steps[0].goal_refs = [];
      const notValid = (await ctx.runNode(
        tripleNode,
        { job_id: `${jobId}-incomplete`, research, plan: incompletePlan },
        { runId: `${jobId}-triple-incomplete` },
      )).output as TripleValidation;

      return { valid, notValid };
    },
    { name: "triple_validation_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({ name: "triple_validation_connector_test", edges: [["START", probe]] });
  const runner = new InMemoryRunner({ agent: rootAgent, appName: "triple_validation_connector_test" });
  const session = await runner.sessionService.createSession({
    appName: "triple_validation_connector_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: ProbeOutput | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: { role: "user", parts: [{ text: "Run parallel Triple Validation" }] },
    })) {
      if ("output" in event && event.output !== undefined) output = event.output as ProbeOutput;
    }

    assert.ok(output, "ADK workflow produced no Triple Validation output");
    assert.equal(output.valid.schema_validation.result, "VALID");
    assert.equal(output.valid.fixture_validation.result, "VALID");
    assert.equal(output.valid.goal_validation.result, "VALID");
    assert.equal(output.valid.all_valid, true);

    assert.equal(output.notValid.schema_validation.result, "VALID");
    assert.equal(output.notValid.fixture_validation.result, "VALID");
    assert.equal(output.notValid.goal_validation.result, "NOT_VALID");
    assert.equal(output.notValid.all_valid, false);
    console.log("TRIPLE_VALID_JSON=" + JSON.stringify(output.valid));
    console.log("TRIPLE_REFINEMENT_SIGNAL_JSON=" + JSON.stringify(output.notValid));
  } finally {
    h.close();
  }
});
