import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryRunner,
  node,
  type NodeContext,
  Workflow,
} from "@google/adk";

import type { ResearchBundle } from "../../contracts/schema/types.js";
import { createResearcherNode } from "../../workflow/adk/node/researcher-node.js";
import { harness, prompt } from "./harness.js";

test("ADK ctx.runNode connects to existing Researcher Role and returns canonical ResearchBundle", async () => {
  const h = await harness("adk-researcher-node");
  const jobId = "job-researcher-001";
  const researcherNode = createResearcherNode(h.researcher);

  const researcherProbe = node(
    async (ctx: NodeContext) => {
      const result = await ctx.runNode(
        researcherNode,
        {
          job_id: jobId,
          prompt: prompt(jobId),
        },
        { runId: `${jobId}-researcher` },
      );
      return result.output;
    },
    { name: "researcher_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({
    name: "researcher_connector_test",
    edges: [["START", researcherProbe]],
  });

  const runner = new InMemoryRunner({
    agent: rootAgent,
    appName: "researcher_connector_test",
  });

  const session = await runner.sessionService.createSession({
    appName: "researcher_connector_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: unknown;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [{ text: "Run the existing OneShot Researcher Role" }],
      },
    })) {
      if ("output" in event && event.output !== undefined) {
        output = event.output;
      }
    }

    assert.ok(output, "ADK workflow produced no Researcher output");
    const bundle = output as ResearchBundle;
    assert.equal(bundle.prompt.prompt_id, `prompt:${jobId}`);
    assert.equal(bundle.researcher.prompt_id, bundle.prompt.prompt_id);
    assert.equal(bundle.researcher.plan_id, bundle.plan.plan_id);
    assert.equal(bundle.researcher.schema_id, bundle.schema_artifact.schema_id);
    assert.equal(bundle.researcher.fixture_id, bundle.fixture.fixture_id);
    assert.equal(bundle.researcher.goal_id, bundle.goal.goal_id);
    assert.equal(bundle.researcher.validation_id, bundle.validation.validation_id);
    assert.ok(bundle.researcher.evidence.length > 0);
    assert.ok(bundle.researcher.success_definition.success_criteria_ids.length > 0);
  } finally {
    h.close();
  }
});
