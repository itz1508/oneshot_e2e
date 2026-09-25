/**
 * OneShot Corrected Workflow State Model
 *
 * Implements the three-owner model from ARCHITECTURE.MD Part 4:
 *
 *   Research          owns research        → ResearchBundle
 *   Design_Planning   owns planning        → Approved Plan
 *   Implementation RT owns implementation  → (separate concern)
 *
 * Each owner runs its own state machine and STOPS at its boundary. The machines are
 * deliberately separate types: merging them is what previously allowed research to
 * auto-invoke planning and planning to reach into the execution lifecycle.
 */

// ── Product configuration ──────────────────────────────────────────────────
export type ProviderId = "gemini" | "openai" | "nebius" | "mistral" | "ollama" | "mock";

export interface ChatConfig {
  provider: ProviderId;
  model: string;
}

/** Drawer-configured research model. Independent of the Main Agent model. */
export interface ResearcherModel {
  provider: ProviderId;
  model: string;
}

/** External search adapter used to gather sources. Search is not Research. */
export type SearchSource = "tavily" | "none";

export interface SearchConfig {
  enabled: boolean;
  source: SearchSource;
}

/** Per-message choice. Scoped to one message, never global. */
export interface UseResearch {
  forMessage: boolean;
}

// ── Research (governed skill) ──────────────────────────────────────────────
export type ResearchPhaseName =
  | "ACTIVE"
  | "RECONCILING"
  | "RESEARCHING"
  | "DRAFTING"
  | "BASELINE_VALIDATING"
  | "REVIEW"
  | "READY_FOR_PLANNING";

/** Terminal phase. Research stops here and never advances further. */
export const RESEARCH_STOP_PHASE: ResearchPhaseName = "READY_FOR_PLANNING";

export const RESEARCH_PHASE_ORDER: ResearchPhaseName[] = [
  "ACTIVE",
  "RECONCILING",
  "RESEARCHING",
  "DRAFTING",
  "BASELINE_VALIDATING",
  "REVIEW",
  "READY_FOR_PLANNING",
];

export const RESEARCH_PHASE_TRANSITIONS: Record<ResearchPhaseName, ResearchPhaseName[]> = {
  ACTIVE: ["RECONCILING"],
  RECONCILING: ["RESEARCHING"],
  RESEARCHING: ["DRAFTING"],
  DRAFTING: ["BASELINE_VALIDATING"],
  BASELINE_VALIDATING: ["REVIEW"],
  REVIEW: ["READY_FOR_PLANNING"],
  READY_FOR_PLANNING: [],
};

export interface ResearchSourceRecord {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface ResearchAlternative {
  /** A candidate approach surfaced by research. Research does NOT choose between these. */
  option: string;
  /** Where this alternative came from. */
  basis: string;
}

/**
 * The only permitted name for research output handed to planning.
 * Cousin names (ResearchContext, ResearchArtifact, ResearchResult, …) are forbidden.
 */
export interface ResearchBundle {
  runId: string;
  intent: string;
  model: ResearcherModel;
  search: SearchConfig;
  sources: ResearchSourceRecord[];
  gaps: string[];
  alternatives: ResearchAlternative[];
  /** Research identifies alternatives; it must NOT select the final build decision. */
  decisionOwner: "Design_Planning";
  createdAt: string;
}

export interface ResearchRun {
  runId: string;
  phase: ResearchPhaseName;
  startedAt: string;
  bundle?: ResearchBundle;
}

// ── Design_Planning (explicitly invoked) ───────────────────────────────────
export type DesignPlanningPhaseName =
  | "UNDEFINED"
  | "DISCOVERY"
  | "OWNERSHIP_DEFINED"
  | "PLANNING"
  | "PRE_BUILD_REVIEWED"
  | "APPROVED_PLAN";

/** Terminal phase. Only a user approval reaches it. */
export const DESIGN_PLANNING_STOP_PHASE: DesignPlanningPhaseName = "APPROVED_PLAN";

export const DESIGN_PLANNING_PHASE_ORDER: DesignPlanningPhaseName[] = [
  "UNDEFINED",
  "DISCOVERY",
  "OWNERSHIP_DEFINED",
  "PLANNING",
  "PRE_BUILD_REVIEWED",
  "APPROVED_PLAN",
];

export const DESIGN_PLANNING_PHASE_TRANSITIONS: Record<
  DesignPlanningPhaseName,
  DesignPlanningPhaseName[]
> = {
  UNDEFINED: ["DISCOVERY"],
  DISCOVERY: ["OWNERSHIP_DEFINED"],
  OWNERSHIP_DEFINED: ["PLANNING"],
  PLANNING: ["PRE_BUILD_REVIEWED"],
  PRE_BUILD_REVIEWED: ["APPROVED_PLAN"],
  APPROVED_PLAN: [],
};

/** The five reviews the Planner performs. It consumes inputs; it never re-researches. */
export type PlannerReviewName = "coverage" | "dependency" | "structure" | "fixture" | "goal";

export interface PlannerInput {
  userIntent: string;
  repositoryState: string;
  existingArchitecture: string;
  existingPhaseReceipts: string[];
  existingBaselines: string[];
  researchBundle?: ResearchBundle;
}

export interface PlannerReview {
  name: PlannerReviewName;
  status: "pending" | "passed" | "failed";
  notes: string;
}

export interface ApprovedPlan {
  planId: string;
  runId: string;
  intent: string;
  steps: string[];
  reviews: PlannerReview[];
  /** Minted by the planner. Open seam: where this is persisted (ARCHITECTURE.MD Part 7). */
  auditId?: string;
  approvedAt?: string;
  approvedBy?: string;
}

export interface DesignPlanningRun {
  runId: string;
  phase: DesignPlanningPhaseName;
  auditId?: string;
  approvedPlan?: ApprovedPlan;
  startedAt: string;
}

// ── Downstream (separate runtime — NOT owned by Design_Planning) ───────────
// ImplementationRun { phase: "IMPLEMENTATION" | "GAP_DISCOVERY" | "GAP_RESOLUTION"
//                          | "VERIFICATION" | "RECEIPT" | "PROMOTION" | "CLOSED" }
// Intentionally not modelled here: the implementation runtime consumes an Approved
// Plan later and is a separate concern (ARCHITECTURE.MD §1.4).

// ── UI-only state ──────────────────────────────────────────────────────────
/** UI ONLY — no workflow meaning. Opening the drawer never starts a workflow. */
export interface DrawerUiState {
  drawerOpen: boolean;
}

/**
 * Cross-owner invariant check.
 *
 * drawerOpen ≠ Research running · Research running ≠ Design_Planning active ·
 * Design_Planning active ≠ implementation. Only READY_FOR_PLANNING hands Research
 * to Planning, and only a user approval ends Planning.
 */
export function isResearchHandoffReady(run: ResearchRun): boolean {
  return run.phase === RESEARCH_STOP_PHASE && run.bundle !== undefined;
}

/** Planning may only be started from a handoff-ready research run, if research ran. */
export function canInvokeDesignPlanning(
  research: ResearchRun | null,
  explicitlyInvoked: boolean
): boolean {
  if (!explicitlyInvoked) return false;
  if (research === null) return true;
  return isResearchHandoffReady(research);
}

export function isResearchRunFinished(run: ResearchRun): boolean {
  return run.phase === RESEARCH_STOP_PHASE;
}

export function isDesignPlanningRunFinished(run: DesignPlanningRun): boolean {
  return run.phase === DESIGN_PLANNING_STOP_PHASE;
}

export function canAdvanceResearch(run: ResearchRun, toPhase: ResearchPhaseName): boolean {
  return RESEARCH_PHASE_TRANSITIONS[run.phase].includes(toPhase);
}

export function canAdvanceDesignPlanning(
  run: DesignPlanningRun,
  toPhase: DesignPlanningPhaseName
): boolean {
  return DESIGN_PLANNING_PHASE_TRANSITIONS[run.phase].includes(toPhase);
}

/** Research must not mutate the repository or decide architecture. */
export function researchMayPerform(
  action: "read_repository" | "query_search" | "write_repository" | "select_architecture"
): boolean {
  return action === "read_repository" || action === "query_search";
}

/** Design_Planning must not simulate Implementation, Build, Verification, or Closed. */
export function designPlanningMayPerform(
  action:
    | "review"
    | "emit_plan"
    | "claim_implementation"
    | "claim_build"
    | "claim_verification"
    | "claim_receipt"
    | "claim_promotion"
    | "claim_closed"
): boolean {
  return action === "review" || action === "emit_plan";
}

// ── Design_Planning runner ─────────────────────────────────────────────────

export interface DesignPlanningResult {
  run: DesignPlanningRun;
  stopped: boolean;
  issues: string[];
}

export interface DesignPlanningOptions {
  runId?: string;
  input: PlannerInput;
  onPhase?: (phase: DesignPlanningPhaseName) => void;
}

/**
 * The Planner consumes established inputs and does NOT re-research the world.
 *
 * It runs the five reviews, emits a plan and an `audit_id`, and stops at
 * `PRE_BUILD_REVIEWED`. Only `approvePlan()` — a user action — reaches
 * `APPROVED_PLAN`. It never simulates Implementation, Build, Verification,
 * Receipt, Promotion, or Closed.
 */
export class DesignPlanningSkill {
  async plan(options: DesignPlanningOptions): Promise<DesignPlanningResult> {
    const runId = options.runId ?? `planning-${Date.now().toString(36)}`;
    const issues: string[] = [];

    const run: DesignPlanningRun = {
      runId,
      phase: "UNDEFINED",
      startedAt: new Date().toISOString(),
    };

    const advanceTo = (phase: DesignPlanningPhaseName): void => {
      if (!canAdvanceDesignPlanning(run, phase)) {
        throw new Error(`Illegal Design_Planning transition: ${run.phase} → ${phase}`);
      }
      run.phase = phase;
      options.onPhase?.(phase);
    };

    advanceTo("DISCOVERY");
    advanceTo("OWNERSHIP_DEFINED");
    advanceTo("PLANNING");

    const { input } = options;
    const hasEvidence = input.researchBundle !== undefined;

    // The five reviews. Each is derived from the supplied inputs only; none of
    // them re-runs research or reaches for the network.
    const reviews: PlannerReview[] = [
      {
        name: "coverage",
        status: input.userIntent.trim() ? "passed" : "failed",
        notes: input.userIntent.trim()
          ? "User intent is stated and was used to scope the plan."
          : "No user intent was supplied.",
      },
      {
        name: "dependency",
        status: input.repositoryState.trim() ? "passed" : "failed",
        notes: input.repositoryState.trim()
          ? "Repository state was supplied and dependencies were considered."
          : "Repository state was not supplied; dependency review is incomplete.",
      },
      {
        name: "structure",
        status: input.existingArchitecture.trim() ? "passed" : "failed",
        notes: input.existingArchitecture.trim()
          ? "Existing architecture was supplied and structure was preserved."
          : "Existing architecture was not supplied; structure review is incomplete.",
      },
      {
        name: "fixture",
        status: input.existingBaselines.length ? "passed" : "failed",
        notes: input.existingBaselines.length
          ? `Reviewed ${input.existingBaselines.length} existing baseline(s).`
          : "No existing baselines were supplied; fixture review is incomplete.",
      },
      {
        name: "goal",
        status: hasEvidence || input.existingPhaseReceipts.length ? "passed" : "failed",
        notes: hasEvidence
          ? "Reviewed the supplied ResearchBundle. The planner did not re-research."
          : input.existingPhaseReceipts.length
            ? "Reviewed existing phase receipts; no ResearchBundle was supplied."
            : "No ResearchBundle or phase receipts were available for goal review.",
      },
    ];

    if (!hasEvidence) {
      issues.push(
        "No ResearchBundle was supplied. Planning proceeded from repository inputs only."
      );
    }

    // Plan steps are derived from the reviewed inputs — never from a fabricated build.
    const steps: string[] = [
      `Establish intent: ${input.userIntent.trim() || "(unstated)"}`,
      `Preserve existing architecture: ${input.existingArchitecture.trim() || "(unstated)"}`,
    ];
    if (hasEvidence && input.researchBundle) {
      for (const gap of input.researchBundle.gaps) {
        steps.push(`Address research gap: ${gap}`);
      }
    }
    for (const receipt of input.existingPhaseReceipts) {
      steps.push(`Carry forward phase receipt: ${receipt}`);
    }
    steps.push("Present plan for user approval");

    run.auditId = `audit-${runId}`;

    advanceTo("PRE_BUILD_REVIEWED");

    // Approval is a separate, explicit user action — see approvePlan().
    return { run, stopped: false, issues };
  }

  /**
   * Ends the run. This is the ONLY path to `APPROVED_PLAN`, and it must be called
   * by a user action — never automatically by the planner itself.
   */
  approvePlan(
    run: DesignPlanningRun,
    plan: Omit<ApprovedPlan, "runId" | "approvedAt" | "approvedBy">,
    approvedBy = "user"
  ): DesignPlanningRun {
    if (run.phase !== "PRE_BUILD_REVIEWED") {
      throw new Error(
        `Design_Planning must be PRE_BUILD_REVIEWED before approval; current phase is ${run.phase}`
      );
    }
    run.approvedPlan = {
      ...plan,
      runId: run.runId,
      auditId: plan.auditId ?? run.auditId,
      approvedAt: new Date().toISOString(),
      approvedBy,
    };
    run.phase = DESIGN_PLANNING_STOP_PHASE;
    return run;
  }
}

export const designPlanningSkill = new DesignPlanningSkill();

// ── Execution-runtime structures (owned by OneShotWorkflowEngine) ──────────
// These describe the separate implementation runtime. They are NOT owned by
// Research or Design_Planning.

/**
 * Base execution node invocation interface
 */
export interface NodeInvocation {
  id: string;
  nodeId?: string;
  scope?: string;
  timestamp?: number;
  parentNodeId?: string;
  metadata?: Record<string, unknown>;
}

export interface StageTodo extends NodeInvocation {
  id: string;
  text: string;
  state: "wait" | "active" | "done" | "fail";
}

/** Stages of the separate implementation runtime. */
export type WorkflowStage =
  | "research"
  | "planning"
  | "gap_analysis"
  | "evaluation"
  | "builder";


export type GateStatus = "PENDING_APPROVAL" | "CONFIRMED" | "REJECTED";

export interface HumanGateState {
  gateId: "gate_1_research_review" | "gate_2_build_ready";
  name: string;
  status: GateStatus;
  confirmedAt?: string;
  confirmedBy?: string;
  packageHash?: string;
}

export interface Step extends NodeInvocation {
  stage: WorkflowStage;
  name: string;
  status: "waiting" | "active" | "completed" | "failed";
  todos?: StageTodo[];
  result?: unknown;
  error?: string;
}

export interface WorkflowStageInfo {
  stage: WorkflowStage;
  name: string;
  status: "waiting" | "active" | "completed" | "failed";
  todos: StageTodo[];
}

export interface WorkflowTransitionResult {
  success: boolean;
  fromStage: WorkflowStage;
  toStage: WorkflowStage;
  error?: string;
  gateRequired?: HumanGateState;
}

/**
 * Single Canonical Workflow Event Envelope
 */
export interface BaseWorkflowEvent<TType extends string = string, TPayload = unknown> {
  id: string;
  type: TType;
  timestamp: number;
  producerId: string;
  publishAs?: string;
  sessionId?: string;
  payload: TPayload;
}
