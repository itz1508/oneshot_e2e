import type { InvocationContext } from "@google/adk";
import type {
  Audit,
  ConfirmedPackage,
  Evaluation,
  FixtureValidationResult,
  GapAnalysis,
  GoalValidationResult,
  HashProof,
  Plan,
  Prompt,
  ResearchBundle,
  RootCause,
  SchemaValidationResult,
  TripleValidation,
} from "../../contract/types.js";
import type { SandboxExecutionResult } from "../../sandbox/types.js";
import type { GapFinding } from "../../role/gap-analysis/tool/coverage.js";

/**
 * ADK session state is orchestration scratch state only.
 * Durable OneShot artifacts remain owned by ArtifactStore / RunRepository.
 */
export const ADK_STATE = {
  runId: "oneshot.run_id",
  prompt: "oneshot.prompt",

  // Orchestration state must use plain session-scoped keys so ADK persists
  // stateDelta between SequentialAgent sub-stages. The ADK session service
  // trims `temp:`-prefixed keys from events, which would make each stage
  // unable to see the previous stage's artifacts.
  bundle: "oneshot.bundle",
  audit: "oneshot.audit",
  plan: "oneshot.plan",

  gapFindings: "oneshot.gap_findings",
  resolvedGaps: "oneshot.resolved_gaps",
  gap: "oneshot.gap",

  evaluation: "oneshot.evaluation",

  schemaValidation: "oneshot.schema_validation",
  fixtureValidation: "oneshot.fixture_validation",
  goalValidation: "oneshot.goal_validation",
  tripleValidation: "oneshot.triple_validation",

  confirmed: "oneshot.confirmed",
  createdHash: "oneshot.created_hash",
  builderResult: "oneshot.builder_result",
  hashProof: "oneshot.hash_proof",

  rootCause: "oneshot.root_cause",
} as const;

function required<T>(ctx: InvocationContext, key: string): T {
  const value = ctx.session.state[key];
  if (value === undefined || value === null) {
    throw new Error(`Missing required ADK workflow state: ${key}`);
  }
  return value as T;
}

export const state = {
  runId: (ctx: InvocationContext) => required<string>(ctx, ADK_STATE.runId),
  prompt: (ctx: InvocationContext) => required<Prompt>(ctx, ADK_STATE.prompt),
  bundle: (ctx: InvocationContext) =>
    required<ResearchBundle>(ctx, ADK_STATE.bundle),
  audit: (ctx: InvocationContext) => required<Audit>(ctx, ADK_STATE.audit),
  plan: (ctx: InvocationContext) => required<Plan>(ctx, ADK_STATE.plan),
  gapFindings: (ctx: InvocationContext) =>
    (ctx.session.state[ADK_STATE.gapFindings] as GapFinding[] | undefined) ?? [],
  resolvedGaps: (ctx: InvocationContext) =>
    (ctx.session.state[ADK_STATE.resolvedGaps] as
      | GapAnalysis["resolved_gaps"]
      | undefined) ?? [],
  gap: (ctx: InvocationContext) =>
    required<GapAnalysis>(ctx, ADK_STATE.gap),
  evaluation: (ctx: InvocationContext) =>
    required<Evaluation>(ctx, ADK_STATE.evaluation),
  schemaValidation: (ctx: InvocationContext) =>
    required<SchemaValidationResult>(ctx, ADK_STATE.schemaValidation),
  fixtureValidation: (ctx: InvocationContext) =>
    required<FixtureValidationResult>(ctx, ADK_STATE.fixtureValidation),
  goalValidation: (ctx: InvocationContext) =>
    required<GoalValidationResult>(ctx, ADK_STATE.goalValidation),
  tripleValidation: (ctx: InvocationContext) =>
    required<TripleValidation>(ctx, ADK_STATE.tripleValidation),
  confirmed: (ctx: InvocationContext) =>
    required<ConfirmedPackage>(ctx, ADK_STATE.confirmed),
  createdHash: (ctx: InvocationContext) =>
    required<string>(ctx, ADK_STATE.createdHash),
  builderResult: (ctx: InvocationContext) =>
    required<SandboxExecutionResult>(ctx, ADK_STATE.builderResult),
  hashProof: (ctx: InvocationContext) =>
    required<HashProof>(ctx, ADK_STATE.hashProof),
  rootCause: (ctx: InvocationContext) =>
    ctx.session.state[ADK_STATE.rootCause] as RootCause | undefined,
};
