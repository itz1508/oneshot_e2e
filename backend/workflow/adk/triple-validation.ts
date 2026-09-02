import { ParallelAgent, SequentialAgent } from "@google/adk";
import type { TripleValidationWorkflow } from "../triple-validation.js";
import { ADK_STATE, state } from "./state.js";
import { OneShotStageAgent, rootCauseDelta } from "./stage-agent.js";

export interface TripleEffects {
  event(
    runId: string,
    processor: string,
    state: "PENDING" | "RUNNING" | "COMPLETE",
    data?: Record<string, unknown>,
  ): void;
  save(runId: string, name: string, value: unknown): Promise<string>;
}

/** Build routing admission + real ADK parallel validators + deterministic gate. */
export function createTripleValidationAgent(
  tripleWorkflow: TripleValidationWorkflow,
  effects: TripleEffects,
): SequentialAgent {
  const admission = new OneShotStageAgent({
    name: "TripleValidationAdmission",
    description:
      "Checks Researcher-owned validator routing before parallel proof fan-out.",
    handler: async (ctx) => {
      try {
        await tripleWorkflow.assertRouting(
          state.bundle(ctx),
          state.plan(ctx),
        );
        return;
      } catch (error) {
        return {
          stateDelta: rootCauseDelta({
            issue: "Triple Validation routing mismatch",
            expected:
              "Schema, Fixture, and Goal validation definitions route to the final plan and Researcher-owned IDs",
            actual: error instanceof Error ? error.message : String(error),
            evidence_ids: [],
            required_correction:
              "Correct the Researcher-owned validation routing inputs",
            recheck_target: state.plan(ctx).plan_id,
          }),
        };
      }
    },
  });

  const schema = new OneShotStageAgent({
    name: "SchemaValidationAgent",
    description: "Runs deterministic Schema Validation on its Python lane.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "SchemaValidation", "RUNNING");
      const result = await tripleWorkflow.schema(
        state.bundle(ctx),
        state.plan(ctx),
      );
      effects.event(runId, "SchemaValidation", "COMPLETE", {
        result: result.result,
        artifact_id: result.schema_id,
      });
      return {
        stateDelta: { [ADK_STATE.schemaValidation]: result },
      };
    },
  });

  const fixture = new OneShotStageAgent({
    name: "FixtureValidationAgent",
    description: "Runs deterministic Fixture Validation on its Python lane.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "FixtureValidation", "RUNNING");
      const result = await tripleWorkflow.fixture(
        state.bundle(ctx),
        state.plan(ctx),
      );
      effects.event(runId, "FixtureValidation", "COMPLETE", {
        result: result.result,
        artifact_id: result.fixture_id,
      });
      return {
        stateDelta: { [ADK_STATE.fixtureValidation]: result },
      };
    },
  });

  const goal = new OneShotStageAgent({
    name: "GoalValidationAgent",
    description: "Runs deterministic Goal Validation on its Python lane.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "GoalValidation", "RUNNING");
      const result = await tripleWorkflow.goal(
        state.bundle(ctx),
        state.plan(ctx),
      );
      effects.event(runId, "GoalValidation", "COMPLETE", {
        result: result.result,
        artifact_id: result.goal_id,
      });
      return {
        stateDelta: { [ADK_STATE.goalValidation]: result },
      };
    },
  });

  const parallel = new ParallelAgent({
    name: "TripleValidationParallel",
    description:
      "Runs Schema, Fixture, and Goal deterministic proof branches concurrently.",
    subAgents: [schema, fixture, goal],
  });

  const gate = new OneShotStageAgent({
    name: "TripleValidationGate",
    description:
      "Joins the three proof results and applies the all_valid admission rule.",
    handler: async (ctx) => {
      const runId = state.runId(ctx);
      effects.event(runId, "TripleValidation", "RUNNING");

      const triple = await tripleWorkflow.join(
        state.bundle(ctx),
        state.plan(ctx),
        state.schemaValidation(ctx),
        state.fixtureValidation(ctx),
        state.goalValidation(ctx),
      );

      await effects.save(runId, "triple-validation", triple);
      effects.event(runId, "TripleValidation", "COMPLETE", {
        result: triple.all_valid ? "VALID" : "NOT_VALID",
        artifact_id: triple.validation_id,
        message: `all_valid=${triple.all_valid}`,
      });

      if (triple.all_valid) {
        return {
          stateDelta: { [ADK_STATE.tripleValidation]: triple },
        };
      }

      const evidenceIds = [
        ...triple.schema_validation.evidence,
        ...triple.fixture_validation.evidence,
        ...triple.goal_validation.evidence,
      ].map((e) => e.evidence_id);

      return {
        stateDelta: {
          [ADK_STATE.tripleValidation]: triple,
          ...rootCauseDelta({
            issue: "Triple Validation rejected plan",
            expected: "Schema, Fixture, Goal all VALID",
            actual: `${triple.schema_validation.result}/${triple.fixture_validation.result}/${triple.goal_validation.result}`,
            evidence_ids: [...new Set(evidenceIds)],
            required_correction: "Correct plan against validator evidence",
            recheck_target: state.plan(ctx).plan_id,
          }),
        },
      };
    },
  });

  return new SequentialAgent({
    name: "TripleValidationWorkflow",
    description:
      "Checks routing, runs real parallel Triple Validation, then joins at the deterministic gate.",
    subAgents: [admission, parallel, gate],
  });
}
