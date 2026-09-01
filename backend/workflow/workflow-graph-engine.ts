/**
 * Google ADK 2.0 OneShot Workflow Graph Engine
 *
 * Authority:
 * - workflow/WorkflowGraph_corrected_optimized.txt
 * - CANONICAL_WORKFLOW.md
 * - Google ADK Graph Routes & JoinNode
 */

import type {
  Audit,
  ConfirmedPackage,
  Evaluation,
  GapAnalysis,
  HashProof,
  Plan,
  ResearchBundle,
  TripleValidation,
  ValidationResult,
  WorkflowResult,
} from "../contract/types.js";
import { CanonicalContractSkill } from "../skill/canonical-contract-skill.js";
import { DeterministicValidationRuntime } from "../validation/deterministic-validation.js";
import { ConfirmationWorkflow } from "./confirmation.js";
import { HashWorkflow } from "./hash.js";
import { TripleValidationWorkflow } from "./triple-validation.js";

export type JobContext = {
  Job_id: string;
  Prompt_id: string;

  Researcher_id?: string;
  plan_id?: string;
  audit_id?: string;

  schema_id?: string;
  fixture_id?: string;
  goal_id?: string;
  validation_id?: string;

  evaluation_result?: WorkflowResult;

  bundle?: ResearchBundle;
  plan?: Plan;
  audit?: Audit;
  gap?: GapAnalysis;
  evaluation?: Evaluation;
  confirmed_package?: ConfirmedPackage;
  created_hash?: string;
  recomputed_hash?: string;
  hash_proof?: HashProof;
  all_valid?: boolean;
};

export type NodeContext = {
  runId: string;
  jobId: string;
};

export type ValidatorNodeResult = {
  validator: "schema" | "fixture" | "goal";
  result: ValidationResult;
  evidence_ids: string[];
};

export interface AdkNode<TInput, TOutput> {
  name: string;
  run: (ctx: NodeContext, input: TInput) => Promise<TOutput>;
}

export class AdkJoinNode<T> {
  constructor(public readonly name: string) {}

  async join(outputs: Record<string, T>): Promise<Record<string, T>> {
    return outputs;
  }
}

export class AdkWorkflow<TInput, TOutput> {
  constructor(
    public readonly name: string,
    public readonly execute: (ctx: NodeContext, input: TInput) => Promise<TOutput>,
  ) {}

  async run(ctx: NodeContext, input: TInput): Promise<TOutput> {
    return this.execute(ctx, input);
  }
}

/**
 * Creates the canonical Google ADK 2.0 Triple Validation Nested Workflow.
 *
 * Fan-out to 3 independent validators → JoinNode fan-in barrier → Gate Node
 */
export function createTripleValidationWorkflow(
  validation: DeterministicValidationRuntime,
  contracts: CanonicalContractSkill,
) {
  const tripleWorkflow = new TripleValidationWorkflow(validation, contracts);
  const tripleJoin = new AdkJoinNode<ValidatorNodeResult>("triple_validation_join");

  return new AdkWorkflow<
    { bundle: ResearchBundle; plan: Plan },
    TripleValidation
  >("oneshot_triple_validation", async (ctx, input) => {
    // 1. Fan-out execution of 3 independent validators
    const [schemaResult, fixtureResult, goalResult] = await Promise.all([
      validation.triple(input.bundle, input.plan).then((t) => ({
        validator: "schema" as const,
        result: t.schema_validation.result,
        evidence_ids: t.schema_validation.evidence.map((e) => e.evidence_id),
      })),
      validation.triple(input.bundle, input.plan).then((t) => ({
        validator: "fixture" as const,
        result: t.fixture_validation.result,
        evidence_ids: t.fixture_validation.evidence.map((e) => e.evidence_id),
      })),
      validation.triple(input.bundle, input.plan).then((t) => ({
        validator: "goal" as const,
        result: t.goal_validation.result,
        evidence_ids: t.goal_validation.evidence.map((e) => e.evidence_id),
      })),
    ]);

    // 2. JoinNode fan-in barrier: waits for all 3 outputs
    const joinedOutputs = await tripleJoin.join({
      schema_validation: schemaResult,
      fixture_validation: fixtureResult,
      goal_validation: goalResult,
    });

    const schema = joinedOutputs.schema_validation;
    const fixture = joinedOutputs.fixture_validation;
    const goal = joinedOutputs.goal_validation;

    // 3. Deterministic all_valid gate
    const all_valid =
      schema.result === "VALID" &&
      fixture.result === "VALID" &&
      goal.result === "VALID";

    if (!all_valid) {
      throw new Error(
        `Triple Validation Gate: NOT_VALID (schema: ${schema.result}, fixture: ${fixture.result}, goal: ${goal.result})`,
      );
    }

    return tripleWorkflow.run(input.bundle, input.plan);
  });
}

/**
 * Creates the full Google ADK 2.0 Job Workflow coordinating all canonical roles.
 */
export function createOneShotAdkWorkflow(
  validation: DeterministicValidationRuntime,
  contracts: CanonicalContractSkill,
) {
  const tripleValidation = createTripleValidationWorkflow(validation, contracts);
  const confirmationWorkflow = new ConfirmationWorkflow(contracts);
  const hashWorkflow = new HashWorkflow(contracts);

  return new AdkWorkflow<JobContext, JobContext>(
    "oneshot_job_workflow",
    async (ctx, input) => {
      if (!input.bundle || !input.plan || !input.audit || !input.gap || !input.evaluation) {
        throw new Error(
          "JobContext requires bundle, plan, audit, gap, and evaluation before Confirmation",
        );
      }

      // Triple Validation Workflow
      const triple = await tripleValidation.run(ctx, {
        bundle: input.bundle,
        plan: input.plan,
      });
      input.all_valid = triple.all_valid;

      if (!input.all_valid) {
        throw new Error("Cannot proceed to Confirmation: Triple Validation is not all VALID");
      }

      // Confirmation Workflow
      const confirmed = await confirmationWorkflow.run(
        input.bundle,
        input.plan,
        input.audit,
        input.gap,
        input.evaluation,
        triple,
      );
      input.confirmed_package = confirmed;

      // Hash Proof Workflow
      const proof = await hashWorkflow.run(confirmed);
      input.created_hash = proof.created_hash;
      input.recomputed_hash = proof.recomputed_hash;
      input.hash_proof = proof;

      return input;
    },
  );
}
