import test from "node:test";
import assert from "node:assert/strict";
import {
  InMemoryRunner,
  node,
  type NodeContext,
  Workflow,
} from "@google/adk";

import type { Audit, ResearchBundle } from "../backend/contract/types.js";
import { createPlannerNode } from "../backend/workflow/adk/node/planner-node.js";
import { createResearcherNode } from "../backend/workflow/adk/node/researcher-node.js";
import { harness, prompt } from "./harness.js";

interface ProbeOutput {
  research: ResearchBundle;
  audit: Audit;
}

test("ADK passes Researcher output directly into existing Planner Role", async () => {
  const h = await harness("adk-planner-node");
  const jobId = "job-planner-001";
  const researcherNode = createResearcherNode(h.researcher);
  const plannerNode = createPlannerNode(h.planner);

  const probe = node(
    async (ctx: NodeContext): Promise<ProbeOutput> => {
      const research = await ctx.runNode(
        researcherNode,
        { job_id: jobId, prompt: prompt(jobId) },
        { runId: `${jobId}-researcher` },
      );

      const audit = await ctx.runNode(
        plannerNode,
        { job_id: jobId, research: research.output },
        { runId: `${jobId}-planner` },
      );

      return { research: research.output, audit: audit.output };
    },
    { name: "researcher_planner_probe", rerunOnResume: true },
  );

  const rootAgent = new Workflow({
    name: "researcher_planner_connector_test",
    edges: [["START", probe]],
  });
  const runner = new InMemoryRunner({
    agent: rootAgent,
    appName: "researcher_planner_connector_test",
  });
  const session = await runner.sessionService.createSession({
    appName: "researcher_planner_connector_test",
    userId: jobId,
    sessionId: jobId,
  });

  let output: ProbeOutput | undefined;
  try {
    for await (const event of runner.runAsync({
      userId: jobId,
      sessionId: session.id,
      newMessage: {
        role: "user",
        parts: [{ text: "Run Researcher then Planner" }],
      },
    })) {
      if ("output" in event && event.output !== undefined) {
        output = event.output as ProbeOutput;
      }
    }

    assert.ok(output, "ADK workflow produced no Researcher -> Planner output");
    assert.equal(output.audit.researcher_id, output.research.researcher.researcher_id);
    assert.equal(output.audit.plan_id, output.research.plan.plan_id);
    assert.ok(output.audit.reviewed_areas.length > 0);

    console.log("RESEARCHER_OUTPUT_JSON=" + JSON.stringify(output.research));
    console.log("PLANNER_OUTPUT_JSON=" + JSON.stringify(output.audit));
  } finally {
    h.close();
  }
});
