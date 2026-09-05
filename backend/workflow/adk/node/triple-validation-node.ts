import { node, type NodeContext } from "@google/adk";
import type {
  FixtureValidationResult,
  GoalValidationResult,
  Plan,
  ResearchBundle,
  SchemaValidationResult,
  TripleValidation,
} from "../../../contracts/schema/types.js";
import type { TripleValidationWorkflow } from "../../triple-validation.js";

export interface TripleValidationNodeInput {
  job_id: string;
  research: ResearchBundle;
  plan: Plan;
}

export interface TripleValidationNodeEffects {
  event?(
    jobId: string,
    processor: "SchemaValidation" | "FixtureValidation" | "GoalValidation",
    state: "RUNNING" | "COMPLETE",
    data?: Record<string, unknown>,
  ): void;
}

export function createTripleValidationNode(
  triple: TripleValidationWorkflow,
  effects: TripleValidationNodeEffects = {},
) {
  const admissionNode = node(
    async (_ctx: NodeContext, input: { research: ResearchBundle; plan: Plan }) => {
      await triple.assertRouting(input.research, input.plan);
      return input;
    },
    { name: "TripleValidationAdmission" },
  );

  const schemaNode = node(
    async (_ctx: NodeContext, input: { research: ResearchBundle; plan: Plan }): Promise<SchemaValidationResult> =>
      triple.schema(input.research, input.plan),
    { name: "SchemaValidation" },
  );

  const fixtureNode = node(
    async (_ctx: NodeContext, input: { research: ResearchBundle; plan: Plan }): Promise<FixtureValidationResult> =>
      triple.fixture(input.research, input.plan),
    { name: "FixtureValidation" },
  );

  const goalNode = node(
    async (_ctx: NodeContext, input: { research: ResearchBundle; plan: Plan }): Promise<GoalValidationResult> =>
      triple.goal(input.research, input.plan),
    { name: "GoalValidation" },
  );

  const joinNode = node(
    async (
      _ctx: NodeContext,
      input: {
        research: ResearchBundle;
        plan: Plan;
        schema: SchemaValidationResult;
        fixture: FixtureValidationResult;
        goal: GoalValidationResult;
      },
    ): Promise<TripleValidation> =>
      triple.join(input.research, input.plan, input.schema, input.fixture, input.goal),
    { name: "TripleValidationJoin" },
  );

  return node(
    async (ctx: NodeContext, input: TripleValidationNodeInput): Promise<TripleValidation> => {
      if (!/[A-Za-z]/.test(input.job_id)) {
        throw new Error("ADK job_id must contain at least one non-numeric character");
      }

      const admitted = (await ctx.runNode(
        admissionNode,
        { research: input.research, plan: input.plan },
        { runId: `${input.job_id}-validation-admission` },
      )).output as { research: ResearchBundle; plan: Plan };

      effects.event?.(input.job_id, "SchemaValidation", "RUNNING");
      effects.event?.(input.job_id, "FixtureValidation", "RUNNING");
      effects.event?.(input.job_id, "GoalValidation", "RUNNING");

      // Start all three before awaiting any one: real ADK dynamic parallel fan-out.
      const schemaTask = ctx.runNode(schemaNode, admitted, { runId: `${input.job_id}-schema` });
      const fixtureTask = ctx.runNode(fixtureNode, admitted, { runId: `${input.job_id}-fixture` });
      const goalTask = ctx.runNode(goalNode, admitted, { runId: `${input.job_id}-goal` });

      const [schemaResult, fixtureResult, goalResult] = await Promise.all([
        schemaTask,
        fixtureTask,
        goalTask,
      ]);
      const schema = schemaResult.output as SchemaValidationResult;
      const fixture = fixtureResult.output as FixtureValidationResult;
      const goal = goalResult.output as GoalValidationResult;

      effects.event?.(input.job_id, "SchemaValidation", "COMPLETE", {
        result: schema.result,
        artifact_id: schema.schema_id,
      });
      effects.event?.(input.job_id, "FixtureValidation", "COMPLETE", {
        result: fixture.result,
        artifact_id: fixture.fixture_id,
      });
      effects.event?.(input.job_id, "GoalValidation", "COMPLETE", {
        result: goal.result,
        artifact_id: goal.goal_id,
      });

      return (await ctx.runNode(
        joinNode,
        {
          research: admitted.research,
          plan: admitted.plan,
          schema,
          fixture,
          goal,
        },
        { runId: `${input.job_id}-validation-join` },
      )).output as TripleValidation;
    },
    { name: "TripleValidation", rerunOnResume: true },
  );
}
