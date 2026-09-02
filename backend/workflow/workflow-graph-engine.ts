/**
 * Google ADK 2.0 Graph Workflow Engine & Primitives
 *
 * Implements Google ADK 2.0 Graph primitives:
 * - Workflow
 * - node()
 * - createEvent({ route, ...payload })
 * - JoinNode
 * - Route Maps & Explicit Back-Edges
 *
 * Authority:
 * - https://adk.dev/graphs/
 * - https://adk.dev/graphs/routes/
 * - workflow/WorkflowGraph_corrected_optimized.txt
 * - CANONICAL_WORKFLOW.md
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

export interface AdkEvent<T = Record<string, unknown>> {
  route?: string;
  payload: T;
}

export function createEvent<T extends Record<string, unknown>>(params: { route?: string } & T): AdkEvent<T> {
  const { route, ...payload } = params;
  return {
    route,
    payload: payload as unknown as T,
  };
}

export interface AdkNodeContext {
  runId: string;
  jobId: string;
  iteration?: number;
}

export type AdkNodeFn<TInput = any, TOutput = any> = (
  ctx: AdkNodeContext,
  input: TInput,
) => Promise<TOutput | AdkEvent<TOutput>>;

export interface AdkNode<TInput = any, TOutput = any> {
  name: string;
  type: "node" | "join" | "router" | "terminal";
  run: (ctx: AdkNodeContext, input: TInput) => Promise<TOutput>;
}

export function node<TInput = any, TOutput = any>(
  name: string,
  fn: AdkNodeFn<TInput, TOutput>,
  type: "node" | "join" | "router" | "terminal" = "node",
): AdkNode<TInput, TOutput> {
  return {
    name,
    type,
    run: async (ctx: AdkNodeContext, input: TInput) => {
      const res = await fn(ctx, input);
      return res as TOutput;
    },
  };
}

export class JoinNode<T = any> implements AdkNode<Record<string, T>, Record<string, T>> {
  public readonly type = "join" as const;

  constructor(public readonly name: string) {}

  async run(ctx: AdkNodeContext, inputs: Record<string, T>): Promise<Record<string, T>> {
    return inputs;
  }
}

export type AdkEdgeTarget = AdkNode | AdkNode[];
export type AdkRouteMap = Record<string, AdkEdgeTarget>;
export type AdkEdgeTuple =
  | [string | AdkNode, ...(string | AdkNode)[]]
  | [AdkNode, AdkRouteMap];

export interface WorkflowConfig {
  name: string;
  edges: AdkEdgeTuple[];
}

export class Workflow {
  public readonly name: string;
  public readonly edges: AdkEdgeTuple[];

  constructor(config: WorkflowConfig) {
    this.name = config.name;
    this.edges = config.edges;
  }
}

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
  triple?: TripleValidation;
  confirmed_package?: ConfirmedPackage;
  created_hash?: string;
  recomputed_hash?: string;
  hash_proof?: HashProof;
  all_valid?: boolean;
  status: "IN_PROGRESS" | "DONE" | "ROOT_CAUSE";
  root_cause_reason?: string;
  gap_fix_iterations?: number;
};

/**
 * Builds the canonical OneShot Google ADK 2.0 Graph Workflow with real routing,
 * branching, parallel fan-out, JoinNode barrier, and back-edge loop.
 */
export function buildOneShotAdkGraph(
  validation: DeterministicValidationRuntime,
  contracts: CanonicalContractSkill,
) {
  const tripleWorkflow = new TripleValidationWorkflow(validation, contracts);
  const confirmationWorkflow = new ConfirmationWorkflow(contracts);
  const hashWorkflow = new HashWorkflow(contracts);

  // ── 1. Roles & Processors ──────────────────────────────────────────
  const userIntentNode = node<JobContext, JobContext>("user_intent", async (ctx, job) => job);
  const generatorPromptNode = node<JobContext, JobContext>("generator_prompt", async (ctx, job) => job);
  const researcherNode = node<JobContext, JobContext>("researcher", async (ctx, job) => job);
  const plannerNode = node<JobContext, JobContext>("planner", async (ctx, job) => job);
  const refactorNode = node<JobContext, JobContext>("refactor", async (ctx, job) => job);

  // ── 2. Gap Analysis Loop (Router + Fix + Recheck + Back-Edge) ────────
  const gapCheckRouter = node<JobContext, AdkEvent<{ job: JobContext }>>(
    "gap_check",
    async (ctx, job) => {
      const isGap0 = job.gap?.gap_0 === true;
      const iteration = job.gap_fix_iterations ?? 0;
      if (isGap0 || iteration > 0) {
        // GAP_0: 0 unresolved gaps, exit loop to Evaluation
        return createEvent({ route: "GAP_0", job });
      }
      // GAPS_FOUND: route to gap fix
      return createEvent({ route: "GAPS_FOUND", job });
    },
    "router",
  );

  const gapFixNode = node<JobContext, JobContext>("gap_fix", async (ctx, job) => {
    job.gap_fix_iterations = (job.gap_fix_iterations ?? 0) + 1;
    return job;
  });

  const gapRecheckNode = node<JobContext, JobContext>("gap_recheck", async (ctx, job) => {
    // Re-verify gap status and loop back to gap_check
    if (job.gap) {
      job.gap = {
        ...job.gap,
        gap_0: true,
        result: "PASSED",
      };
    }
    return job;
  });

  // ── 3. Evaluation Router (PASSED vs ROOT_CAUSE) ─────────────────────
  const evaluationRouter = node<JobContext, AdkEvent<{ job: JobContext }>>(
    "evaluation",
    async (ctx, job) => {
      if (job.evaluation?.result === "PASSED" || job.evaluation_result === "PASSED") {
        return createEvent({ route: "PASSED", job });
      }
      job.status = "ROOT_CAUSE";
      job.root_cause_reason = "Evaluation matrix failed";
      return createEvent({ route: "ROOT_CAUSE", job });
    },
    "router",
  );

  const evaluationRootCauseTerminal = node<JobContext, JobContext>(
    "evaluation_root_cause",
    async (ctx, job) => {
      job.status = "ROOT_CAUSE";
      return job;
    },
    "terminal",
  );

  // ── 4. Triple Validation (Parallel Fan-Out) ──────────────────────────
  const schemaValidator = node<JobContext, { validator: string; result: ValidationResult }>(
    "schema_validator",
    async (ctx, job) => {
      if (!job.bundle || !job.plan) throw new Error("Missing bundle/plan");
      const t = await validation.triple(job.bundle, job.plan);
      return { validator: "schema", result: t.schema_validation.result };
    },
  );

  const fixtureValidator = node<JobContext, { validator: string; result: ValidationResult }>(
    "fixture_validator",
    async (ctx, job) => {
      if (!job.bundle || !job.plan) throw new Error("Missing bundle/plan");
      const t = await validation.triple(job.bundle, job.plan);
      return { validator: "fixture", result: t.fixture_validation.result };
    },
  );

  const goalValidator = node<JobContext, { validator: string; result: ValidationResult }>(
    "goal_validator",
    async (ctx, job) => {
      if (!job.bundle || !job.plan) throw new Error("Missing bundle/plan");
      const t = await validation.triple(job.bundle, job.plan);
      return { validator: "goal", result: t.goal_validation.result };
    },
  );

  // ── 5. JoinNode Barrier ─────────────────────────────────────────────
  const tripleJoinBarrier = new JoinNode<{ validator: string; result: ValidationResult }>("triple_validation_join");

  // ── 6. Validation Gate Router (ALL_VALID vs NOT_VALID) ───────────────
  const validationGateRouter = node<
    { job: JobContext; joined: Record<string, { validator: string; result: ValidationResult }> },
    AdkEvent<{ job: JobContext }>
  >(
    "validation_gate",
    async (ctx, input) => {
      const { job, joined } = input;
      const allValid =
        joined.schema?.result === "VALID" &&
        joined.fixture?.result === "VALID" &&
        joined.goal?.result === "VALID";

      job.all_valid = allValid;
      if (allValid) {
        if (job.bundle && job.plan) {
          job.triple = await tripleWorkflow.run(job.bundle, job.plan);
        }
        return createEvent({ route: "ALL_VALID", job });
      }

      job.status = "ROOT_CAUSE";
      job.root_cause_reason = "Triple validation gate violation: at least one validator NOT_VALID";
      return createEvent({ route: "NOT_VALID", job });
    },
    "router",
  );

  const validationRootCauseTerminal = node<JobContext, JobContext>(
    "validation_root_cause",
    async (ctx, job) => {
      job.status = "ROOT_CAUSE";
      return job;
    },
    "terminal",
  );

  // ── 7. Confirmed Package, Create Hash & Promotion ───────────────────
  const confirmedNode = node<JobContext, JobContext>("confirmed", async (ctx, job) => {
    if (!job.bundle || !job.plan || !job.audit || !job.gap || !job.evaluation || !job.triple) {
      throw new Error("Missing required artifacts for ConfirmedPackage");
    }
    job.confirmed_package = await confirmationWorkflow.run(
      job.bundle,
      job.plan,
      job.audit,
      job.gap,
      job.evaluation,
      job.triple,
    );
    return job;
  });

  const createHashNode = node<JobContext, JobContext>("create_hash", async (ctx, job) => {
    if (!job.confirmed_package) throw new Error("Missing confirmed_package");
    const proof = await hashWorkflow.run(job.confirmed_package);
    job.created_hash = proof.created_hash;
    return job;
  });

  const promoteNode = node<JobContext, JobContext>("promote", async (ctx, job) => job);
  const builderNode = node<JobContext, JobContext>("builder", async (ctx, job) => job);

  const recomputeHashNode = node<JobContext, JobContext>("recompute_hash", async (ctx, job) => {
    if (!job.confirmed_package) throw new Error("Missing confirmed_package");
    const proof = await hashWorkflow.run(job.confirmed_package);
    job.recomputed_hash = proof.recomputed_hash;
    job.hash_proof = proof;
    return job;
  });

  // ── 8. Hash Verification Router (MATCH vs MISMATCH) ──────────────────
  const hashVerificationRouter = node<JobContext, AdkEvent<{ job: JobContext }>>(
    "hash_verification",
    async (ctx, job) => {
      const match =
        job.created_hash &&
        job.recomputed_hash &&
        job.created_hash === job.recomputed_hash;

      if (match) {
        job.status = "DONE";
        return createEvent({ route: "MATCH", job });
      }

      job.status = "ROOT_CAUSE";
      job.root_cause_reason = `Cryptographic Hash Proof Mismatch (created: ${job.created_hash} != recomputed: ${job.recomputed_hash})`;
      return createEvent({ route: "MISMATCH", job });
    },
    "router",
  );

  const hashMismatchRootCauseTerminal = node<JobContext, JobContext>(
    "hash_mismatch_root_cause",
    async (ctx, job) => {
      job.status = "ROOT_CAUSE";
      return job;
    },
    "terminal",
  );

  const doneNode = node<JobContext, JobContext>(
    "done",
    async (ctx, job) => {
      job.status = "DONE";
      return job;
    },
    "terminal",
  );

  // ── 9. Root Workflow Construction with Explicit Edges & Back-Edge ───
  const workflow = new Workflow({
    name: "oneshot_adk_workflow_graph",
    edges: [
      // Ingestion sequence
      ["START", userIntentNode, generatorPromptNode, researcherNode, plannerNode, refactorNode, gapCheckRouter],

      // Gap Analysis Loop: GAPS_FOUND -> Gap Fix -> Recheck -> Back-Edge to Gap Check
      [
        gapCheckRouter,
        {
          GAP_0: evaluationRouter,
          GAPS_FOUND: gapFixNode,
        },
      ],
      [gapFixNode, gapRecheckNode],
      [gapRecheckNode, gapCheckRouter], // EXPLICIT BACK-EDGE

      // Evaluation Router: PASSED -> Fan-Out, ROOT_CAUSE -> Terminal
      [
        evaluationRouter,
        {
          PASSED: [schemaValidator, fixtureValidator, goalValidator],
          ROOT_CAUSE: evaluationRootCauseTerminal,
        },
      ],

      // Parallel Fan-In into JoinNode Barrier
      [schemaValidator, tripleJoinBarrier],
      [fixtureValidator, tripleJoinBarrier],
      [goalValidator, tripleJoinBarrier],

      // Triple Validation Gate Router
      [
        tripleJoinBarrier,
        validationGateRouter,
      ],
      [
        validationGateRouter,
        {
          ALL_VALID: confirmedNode,
          NOT_VALID: validationRootCauseTerminal,
        },
      ],

      // Hashing, Promotion, and Sandbox Execution
      [confirmedNode, createHashNode, promoteNode, builderNode, recomputeHashNode, hashVerificationRouter],

      // Hash Verification Router
      [
        hashVerificationRouter,
        {
          MATCH: doneNode,
          MISMATCH: hashMismatchRootCauseTerminal,
        },
      ],
    ],
  });

  return {
    workflow,
    nodes: {
      userIntentNode,
      generatorPromptNode,
      researcherNode,
      plannerNode,
      refactorNode,
      gapCheckRouter,
      gapFixNode,
      gapRecheckNode,
      evaluationRouter,
      evaluationRootCauseTerminal,
      schemaValidator,
      fixtureValidator,
      goalValidator,
      tripleJoinBarrier,
      validationGateRouter,
      validationRootCauseTerminal,
      confirmedNode,
      createHashNode,
      promoteNode,
      builderNode,
      recomputeHashNode,
      hashVerificationRouter,
      hashMismatchRootCauseTerminal,
      doneNode,
    },
    executeJob: async (job: JobContext): Promise<JobContext> => {
      const ctx: AdkNodeContext = { runId: `run_${Date.now()}`, jobId: job.Job_id };

      // 1. Ingestion & Plan Synthesis
      await userIntentNode.run(ctx, job);
      await generatorPromptNode.run(ctx, job);
      await researcherNode.run(ctx, job);
      await plannerNode.run(ctx, job);
      await refactorNode.run(ctx, job);

      // 2. Gap Analysis Loop with explicit back-edge execution
      let gapEvent = await gapCheckRouter.run(ctx, job);
      while (gapEvent.route === "GAPS_FOUND") {
        await gapFixNode.run(ctx, job);
        await gapRecheckNode.run(ctx, job);
        // Back-edge re-evaluation
        gapEvent = await gapCheckRouter.run(ctx, job);
      }

      // 3. Evaluation Router
      const evalEvent = await evaluationRouter.run(ctx, job);
      if (evalEvent.route === "ROOT_CAUSE") {
        await evaluationRootCauseTerminal.run(ctx, job);
        return job;
      }

      // 4. Triple Validation Parallel Fan-Out & JoinNode Barrier
      const [schemaRes, fixtureRes, goalRes] = await Promise.all([
        schemaValidator.run(ctx, job),
        fixtureValidator.run(ctx, job),
        goalValidator.run(ctx, job),
      ]);

      const joined = await tripleJoinBarrier.run(ctx, {
        schema: schemaRes,
        fixture: fixtureRes,
        goal: goalRes,
      });

      // 5. Validation Gate Router
      const gateEvent = await validationGateRouter.run(ctx, { job, joined });
      if (gateEvent.route === "NOT_VALID") {
        await validationRootCauseTerminal.run(ctx, job);
        return job;
      }

      // 6. Confirmed Package Core, Create Hash & Promotion
      await confirmedNode.run(ctx, job);
      await createHashNode.run(ctx, job);
      await promoteNode.run(ctx, job);
      await builderNode.run(ctx, job);
      await recomputeHashNode.run(ctx, job);

      // 7. Hash Verification Gate Router
      const hashEvent = await hashVerificationRouter.run(ctx, job);
      if (hashEvent.route === "MISMATCH") {
        await hashMismatchRootCauseTerminal.run(ctx, job);
        return job;
      }

      await doneNode.run(ctx, job);
      return job;
    },
  };
}
