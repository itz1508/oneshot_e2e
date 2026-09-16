import crypto from "node:crypto";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { RunRepository } from "../runtime/run-repository.js";
import { PlanReviewService, PlanReviewError, type PlanReview } from "../runtime/plan-review.js";
import type { ConversationStore } from "./conversation-store.js";
import type { ResearchBundle } from "../contracts/schema/types.js";
import type {
  ResearchDrawerProjection,
  CorrectionRequest,
  ImpactAnalysis,
  ResearchWorkItem,
  CorrectionCycle,
  CreateCorrectionCommand,
  AgreeReviewCommand,
  ResearchDrawerStatus,
} from "./research-drawer.js";

export class ConflictError extends Error {
  constructor(message: string, readonly details?: Record<string, unknown>) {
    super(message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotFoundError";
  }
}

export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/**
 * Service governing the Research Drawer projection and revision-bound
 * Correction Cycles.
 */
export class ResearchCorrectionService {
  private activeCycles = new Map<string, CorrectionCycle>();
  private idempotencyRecords = new Map<string, { correction_id: string; operation_id: string }>();

  constructor(
    private readonly conversationStore: ConversationStore,
    private readonly artifactStore: ArtifactStore,
    private readonly planReviewService: PlanReviewService,
    private readonly runs: RunRepository,
  ) {}

  /**
   * Produce the governed Research Drawer projection for a conversation.
   */
  async getDrawerProjection(conversationId: string): Promise<ResearchDrawerProjection> {
    const conv = this.conversationStore.get(conversationId);
    if (!conv) {
      throw new NotFoundError(`Conversation '${conversationId}' not found`);
    }

    const conversationRevision = conv.intent.revision;
    const activeCycle = this.activeCycles.get(conversationId);

    // Identify associated run
    const runId = this.resolveRunIdForConversation(conversationId);
    const runSnap = runId ? this.runs.get(runId) : undefined;
    const review = runId ? await this.planReviewService.get(runId) : undefined;

    const researchRevision = review?.revision ?? 1;

    // Determine high-level drawer status
    let status: ResearchDrawerStatus = "Off";
    if (activeCycle && activeCycle.status === "ACTIVE") {
      status = "Reconciling";
    } else if (review?.status === "pending") {
      status = "Needs Review";
    } else if (review?.status === "approved") {
      status = "Ready";
    } else if (runSnap) {
      if (runSnap.pipeline_status === "Running") {
        if (runSnap.current_processor === "Researcher") {
          status = "Researching";
        } else if (
          runSnap.current_processor === "Validation" ||
          runSnap.current_processor === "GapAnalysis"
        ) {
          status = "Validating";
        } else {
          status = "Drafting";
        }
      }
    } else if (conv.intent.ready_for_prompt || conv.turns.length > 0) {
      status = "Drafting";
    }

    // Summary
    const goal =
      conv.intent.goal ||
      review?.research?.goal?.objective ||
      "Define project goal";
    const keyRequirements =
      conv.intent.requirements.length > 0
        ? conv.intent.requirements
        : review?.research?.plan?.requirements.map((r) => r.statement) || [];
    const importantDecisions = review?.edits?.notes || conv.intent.context || [];

    const summary = {
      current_understanding:
        conv.intent.requested_outcome ||
        (review?.research?.prompt?.requested_outcome ?? "Awaiting initial prompt"),
      goal,
      key_requirements: keyRequirements,
      important_decisions: importantDecisions,
    };

    // Research facts & provenance
    const facts =
      review?.research?.researcher?.evidence?.map((e) => ({
        id: e.evidence_id,
        statement: e.statement,
        provenance: e.provenance || e.source,
      })) || [];
    const sources = Array.from(new Set(facts.map((f) => f.provenance))).filter(Boolean);
    const unresolvedQuestions = conv.intent.missing_required_information || [];

    const research = {
      facts,
      sources,
      unresolved_questions: unresolvedQuestions,
    };

    // Build readiness
    const fixtureId = review?.research?.fixture?.fixture_id;
    let validationStatus: "PASSED" | "FAILED" | "PENDING" | "NOT_STARTED" = "NOT_STARTED";
    let lockStatus: "LOCKED" | "UNLOCKED" | "SUPERSEDED" = "UNLOCKED";
    const openBlockers: string[] = [];

    if (activeCycle && activeCycle.status === "ACTIVE") {
      validationStatus = "PENDING";
      lockStatus = "SUPERSEDED";
      openBlockers.push("Correction cycle in progress");
    } else if (review?.status === "approved") {
      validationStatus = "PASSED";
      lockStatus = "LOCKED";
    } else if (review?.status === "pending") {
      validationStatus = "PASSED";
      lockStatus = "UNLOCKED";
    }

    if (runSnap?.root_cause) {
      openBlockers.push(runSnap.root_cause.issue);
      validationStatus = "FAILED";
    }
    if (runSnap?.help_request) {
      openBlockers.push(runSnap.help_request.reason);
    }

    const buildReadiness = {
      baseline: review?.research?.schema_artifact?.schema_id || "canonical-v1",
      fixture_id: fixtureId,
      validation_status: validationStatus,
      lock_status: lockStatus,
      open_blockers: openBlockers,
    };

    // Review status & allowed actions
    let reviewStatus: "pending" | "approved" | "correction_requested" | "none" = "none";
    const allowedActions: ("agree" | "request_correction")[] = [];

    if (activeCycle && activeCycle.status === "ACTIVE") {
      reviewStatus = "correction_requested";
    } else if (review?.status === "pending") {
      reviewStatus = "pending";
      allowedActions.push("agree", "request_correction");
    } else if (review?.status === "approved") {
      reviewStatus = "approved";
    }

    const reviewSection = {
      status: reviewStatus,
      revision: researchRevision,
      active_correction: activeCycle?.correction_request
        ? {
            id: activeCycle.correction_request.correction_id,
            feedback: activeCycle.correction_request.feedback,
            status: activeCycle.correction_request.status,
          }
        : undefined,
      allowed_actions: allowedActions,
    };

    // Handoff to planner
    const readyForPlanner =
      review?.status === "approved" &&
      (!activeCycle || activeCycle.status === "RESOLVED") &&
      openBlockers.length === 0;

    const handoff = {
      research_bundle_status: review?.research ? "VALIDATED" : "NOT_STARTED",
      ready_for_planner: readyForPlanner,
    };

    return {
      conversation_id: conversationId,
      research_revision: researchRevision,
      conversation_revision: conversationRevision,
      status,
      summary,
      research,
      build_readiness: buildReadiness,
      review: reviewSection,
      handoff,
      run_id: runId,
      updated_at: new Date().toISOString(),
    };
  }

  /**
   * Submit an append-only, revision-bound correction request.
   */
  async submitCorrection(
    conversationId: string,
    cmd: CreateCorrectionCommand,
  ): Promise<{
    accepted: boolean;
    correction_id: string;
    operation_id: string;
    research_revision: number;
    status: string;
  }> {
    if (!cmd.feedback || typeof cmd.feedback !== "string" || !cmd.feedback.trim()) {
      throw new BadRequestError("Feedback is required for a correction request");
    }

    const conv = this.conversationStore.get(conversationId);
    if (!conv) {
      throw new NotFoundError(`Conversation '${conversationId}' not found`);
    }

    // Idempotency check
    if (cmd.idempotency_key && this.idempotencyRecords.has(cmd.idempotency_key)) {
      const existing = this.idempotencyRecords.get(cmd.idempotency_key)!;
      return {
        accepted: true,
        correction_id: existing.correction_id,
        operation_id: existing.operation_id,
        research_revision: cmd.expected_research_revision,
        status: "RECONCILING",
      };
    }

    // Optimistic concurrency check against conversation revision
    if (cmd.expected_conversation_revision !== conv.intent.revision) {
      throw new ConflictError(
        `Stale conversation revision. Expected ${cmd.expected_conversation_revision} but current is ${conv.intent.revision}`,
        {
          expected: cmd.expected_conversation_revision,
          actual: conv.intent.revision,
          field: "conversation_revision",
        },
      );
    }

    // Resolve run & review
    const runId = this.resolveRunIdForConversation(conversationId);
    if (!runId) {
      throw new ConflictError("No active research run found for this conversation", {
        conversation_id: conversationId,
      });
    }

    const review = await this.ensureReview(conversationId, runId);

    // Optimistic concurrency check against research revision
    if (cmd.expected_research_revision !== review.revision) {
      throw new ConflictError(
        `Stale research revision. Expected ${cmd.expected_research_revision} but current is ${review.revision}`,
        {
          expected: cmd.expected_research_revision,
          actual: review.revision,
          field: "research_revision",
        },
      );
    }

    const correctionId = `corr-${crypto.randomUUID().slice(0, 8)}`;
    const operationId = `op-${crypto.randomUUID().slice(0, 8)}`;
    const cycleId = `cycle-${crypto.randomUUID().slice(0, 8)}`;

    const correctionRequest: CorrectionRequest = {
      correction_id: correctionId,
      conversation_id: conversationId,
      research_revision: review.revision,
      conversation_revision: conv.intent.revision,
      requested_by: cmd.requested_by || "MAIN_AGENT",
      feedback: cmd.feedback.trim(),
      targets: cmd.targets || [],
      status: "ACCEPTED",
      idempotency_key: cmd.idempotency_key,
      created_at: new Date().toISOString(),
      operation_id: operationId,
    };

    // Run Impact Analysis on the correction request
    const impact = this.performImpactAnalysis(correctionRequest, review);
    correctionRequest.impact_analysis_id = impact.impact_analysis_id;

    // Formulate executable Work Item DAG
    const workItems = this.createWorkItems(cycleId, correctionRequest, impact);

    const cycle: CorrectionCycle = {
      correction_cycle_id: cycleId,
      conversation_id: conversationId,
      parent_research_revision: review.revision,
      correction_request: correctionRequest,
      impact_analysis: impact,
      work_items: workItems,
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // Store in-memory and persist to artifact store
    this.activeCycles.set(conversationId, cycle);
    if (cmd.idempotency_key) {
      this.idempotencyRecords.set(cmd.idempotency_key, {
        correction_id: correctionId,
        operation_id: operationId,
      });
    }

    await this.artifactStore.save(runId, `corrections.${correctionId}`, correctionRequest);
    await this.artifactStore.save(runId, `impact.${impact.impact_analysis_id}`, impact);

    // Asynchronously execute candidate correction DAG and commit Revision N+1
    void this.executeCorrectionCycle(conv, runId, review, cycle);

    return {
      accepted: true,
      correction_id: correctionId,
      operation_id: operationId,
      research_revision: review.revision,
      status: "RECONCILING",
    };
  }

  /**
   * Agree / Approve the research review for a conversation.
   */
  async agreeReview(
    conversationId: string,
    cmd: AgreeReviewCommand,
  ): Promise<PlanReview> {
    const conv = this.conversationStore.get(conversationId);
    if (!conv) {
      throw new NotFoundError(`Conversation '${conversationId}' not found`);
    }

    if (cmd.expected_conversation_revision !== conv.intent.revision) {
      throw new ConflictError(
        `Stale conversation revision. Expected ${cmd.expected_conversation_revision} but current is ${conv.intent.revision}`,
        {
          expected: cmd.expected_conversation_revision,
          actual: conv.intent.revision,
        },
      );
    }

    const runId = this.resolveRunIdForConversation(conversationId);
    if (!runId) {
      throw new NotFoundError(`No research run associated with conversation '${conversationId}'`);
    }

    const review = await this.ensureReview(conversationId, runId);

    if (cmd.expected_research_revision !== review.revision) {
      throw new ConflictError(
        `Stale research revision. Expected ${cmd.expected_research_revision} but current is ${review.revision}`,
        {
          expected: cmd.expected_research_revision,
          actual: review.revision,
        },
      );
    }

    // Call underlying plan review service with approve action
    const currentEdits = review.edits
      ? structuredClone(review.edits)
      : {
          objective: review.research.goal.objective,
          requirements: review.research.plan.requirements.map((r) => ({
            id: r.requirement_id,
            statement: r.statement,
          })),
          steps: review.research.plan.steps.map((s) => ({
            id: s.step_id,
            description: s.description,
          })),
          notes: [],
        };
    if (cmd.notes && cmd.notes.length > 0) {
      currentEdits.notes = [...currentEdits.notes, ...cmd.notes];
    }

    const updatedReview = await this.planReviewService.decide(
      runId,
      {
        action: "approve",
        revision: review.revision,
        edits: currentEdits,
      },
      this.conversationStore,
    );

    // Resolve any active cycle
    const cycle = this.activeCycles.get(conversationId);
    if (cycle && cycle.status === "ACTIVE") {
      cycle.status = "RESOLVED";
      cycle.updated_at = new Date().toISOString();
    }

    return updatedReview;
  }

  // ---------------------------------------------------------------------------
  // Internal DAG Generation & Execution
  // ---------------------------------------------------------------------------

  private performImpactAnalysis(
    correction: CorrectionRequest,
    review: PlanReview,
  ): ImpactAnalysis {
    const text = correction.feedback.toLowerCase();
    const affected: string[] = [];
    let researchRequired = false;

    // Check targets first
    for (const t of correction.targets) {
      affected.push(t.artifact_type.toLowerCase());
    }

    // Impact classification
    if (text.includes("fixture") || text.includes("auth") || text.includes("assert")) {
      if (!affected.includes("fixture")) affected.push("fixture");
      if (!affected.includes("traceability")) affected.push("traceability");
    }
    if (text.includes("requirement") || text.includes("spec") || text.includes("scope")) {
      if (!affected.includes("requirements")) affected.push("requirements");
      if (!affected.includes("traceability")) affected.push("traceability");
    }
    if (text.includes("fact") || text.includes("source") || text.includes("documentation") || text.includes("api returns")) {
      if (!affected.includes("facts")) affected.push("facts");
      researchRequired = true;
    }
    if (affected.length === 0) {
      affected.push("fixture", "traceability");
    }

    return {
      impact_analysis_id: `impact-${crypto.randomUUID().slice(0, 8)}`,
      correction_id: correction.correction_id,
      research_revision: review.revision,
      status: "COMPLETED",
      affected_artifacts: affected,
      affected_dependencies: ["baseline_validation", "fixture_lock"],
      research_required: researchRequired,
      validation_required: ["schema_validation", "fixture_validation", "goal_validation"],
      work_item_ids: [],
      reasoning_summary: {
        reason: `Correction impact assessed against revision ${review.revision}. Affected: ${affected.join(", ")}`,
        research_required: researchRequired,
        affected_artifacts: affected,
      },
      created_at: new Date().toISOString(),
    };
  }

  private createWorkItems(
    cycleId: string,
    correction: CorrectionRequest,
    impact: ImpactAnalysis,
  ): ResearchWorkItem[] {
    const items: ResearchWorkItem[] = [];
    const parentRevision = correction.research_revision;

    if (impact.research_required) {
      items.push({
        work_item_id: `work-${crypto.randomUUID().slice(0, 6)}`,
        correction_id: correction.correction_id,
        correction_cycle_id: cycleId,
        parent_research_revision: parentRevision,
        type: "RECONCILE_FACTS",
        status: "READY",
        dependencies: [],
        inputs: { feedback: correction.feedback },
        created_at: new Date().toISOString(),
      });
    }

    const fixtureDependencies = items.map((i) => i.work_item_id);
    const fixtureItem: ResearchWorkItem = {
      work_item_id: `work-${crypto.randomUUID().slice(0, 6)}`,
      correction_id: correction.correction_id,
      correction_cycle_id: cycleId,
      parent_research_revision: parentRevision,
      type: "REBUILD_FIXTURE",
      status: "READY",
      dependencies: fixtureDependencies,
      inputs: {
        feedback: correction.feedback,
        targets: correction.targets,
      },
      created_at: new Date().toISOString(),
    };
    items.push(fixtureItem);

    const traceItem: ResearchWorkItem = {
      work_item_id: `work-${crypto.randomUUID().slice(0, 6)}`,
      correction_id: correction.correction_id,
      correction_cycle_id: cycleId,
      parent_research_revision: parentRevision,
      type: "REBUILD_TRACEABILITY",
      status: "READY",
      dependencies: [fixtureItem.work_item_id],
      inputs: {},
      created_at: new Date().toISOString(),
    };
    items.push(traceItem);

    const validateItem: ResearchWorkItem = {
      work_item_id: `work-${crypto.randomUUID().slice(0, 6)}`,
      correction_id: correction.correction_id,
      correction_cycle_id: cycleId,
      parent_research_revision: parentRevision,
      type: "BASELINE_VALIDATE",
      status: "READY",
      dependencies: [traceItem.work_item_id],
      inputs: {},
      created_at: new Date().toISOString(),
    };
    items.push(validateItem);

    const assembleItem: ResearchWorkItem = {
      work_item_id: `work-${crypto.randomUUID().slice(0, 6)}`,
      correction_id: correction.correction_id,
      correction_cycle_id: cycleId,
      parent_research_revision: parentRevision,
      type: "ASSEMBLE_CANDIDATE",
      status: "READY",
      dependencies: [validateItem.work_item_id],
      inputs: {},
      created_at: new Date().toISOString(),
    };
    items.push(assembleItem);

    impact.work_item_ids = items.map((i) => i.work_item_id);
    return items;
  }

  private async executeCorrectionCycle(
    conv: import("./types.js").ConversationSnapshot,
    runId: string,
    frozenParentReview: PlanReview,
    cycle: CorrectionCycle,
  ): Promise<void> {
    try {
      // 1. Mark work items running
      for (const item of cycle.work_items) {
        item.status = "RUNNING";
        // Simulate candidate generation from frozen parent
        item.outputs = {
          candidate_artifact: `${item.type}-result`,
          generated_for_cycle: cycle.correction_cycle_id,
        };
        item.status = "COMPLETED";
        item.completed_at = new Date().toISOString();
      }

      // 2. Candidate Assembly & Atomic Revision Commit producing Revision N+1
      const parentBundle = frozenParentReview.research;
      const candidateBundle: ResearchBundle = structuredClone(parentBundle);

      // Apply correction updates to candidate ResearchBundle
      const newAssertionId = `assertion:corr-${crypto.randomUUID().slice(0, 6)}`;
      candidateBundle.fixture.plan_assertions.push({
        assertion_id: newAssertionId,
        operator: "contains",
        target: "plan.steps",
        expected: cycle.correction_request.feedback,
        evidence_ids: [`evidence:${cycle.correction_request.correction_id}`],
      });

      candidateBundle.researcher.evidence.push({
        evidence_id: `evidence:${cycle.correction_request.correction_id}`,
        source: "correction_request",
        statement: cycle.correction_request.feedback,
        provenance: `reviewer:${cycle.correction_request.requested_by}`,
      });

      // 3. Atomically commit Revision N+1 to PlanReview
      const nextRevision = frozenParentReview.revision + 1;
      const updatedReview: PlanReview = {
        run_id: runId,
        revision: nextRevision,
        status: "pending",
        created_at: new Date().toISOString(),
        research: candidateBundle,
        edits: {
          objective: candidateBundle.goal.objective,
          requirements: candidateBundle.plan.requirements.map((r) => ({
            id: r.requirement_id,
            statement: r.statement,
          })),
          steps: candidateBundle.plan.steps.map((s) => ({
            id: s.step_id,
            description: s.description,
          })),
          notes: [
            ...frozenParentReview.edits.notes,
            `Applied correction (${cycle.correction_request.correction_id}): ${cycle.correction_request.feedback}`,
          ],
        },
        conversation_id: conv.conversation_id,
        conversation_revision: conv.intent.revision,
        conversation_hash: conv.conversation_hash,
      };

      await this.artifactStore.save(runId, "review", updatedReview);
      await this.artifactStore.save(runId, `review.revision.${nextRevision}`, updatedReview);

      cycle.status = "RESOLVED";
      cycle.candidate_revision = nextRevision;
      cycle.correction_request.status = "RESOLVED";
      cycle.correction_request.completed_at = new Date().toISOString();
      cycle.updated_at = new Date().toISOString();

      await this.artifactStore.save(runId, `cycles.${cycle.correction_cycle_id}`, cycle);
    } catch (err) {
      cycle.status = "FAILED";
      cycle.correction_request.status = "REJECTED";
      cycle.updated_at = new Date().toISOString();
    }
  }

  private async ensureReview(conversationId: string, runId: string): Promise<PlanReview> {
    const existing = await this.planReviewService.get(runId);
    if (existing) return existing;

    const conv = this.conversationStore.get(conversationId);
    const goal = conv?.intent.goal || "Build requested project";
    const outcome = conv?.intent.requested_outcome || "Complete user objectives";
    const requirements = conv?.intent.requirements && conv.intent.requirements.length > 0
      ? conv.intent.requirements.map((r, i) => ({
          requirement_id: `req-${i + 1}`,
          statement: r,
          category: "functional" as const,
        }))
      : [
          {
            requirement_id: "req-1",
            statement: outcome,
            category: "functional" as const,
          },
        ];

    const promptId = `prompt:${runId}`;
    const researcherId = `researcher:${runId}`;
    const planId = `plan:${runId}`;
    const schemaId = `schema:${runId}`;
    const fixtureId = `fixture:${runId}`;
    const goalId = `goal:${runId}`;
    const validationId = `validation:${runId}`;
    const evidenceId = `evidence:${runId}-initial`;

    const evidenceList: import("../contracts/schema/types.js").EvidenceRef[] = [
      {
        evidence_id: evidenceId,
        source: "conversation_intent",
        statement: outcome,
        provenance: `conversation:${conversationId}`,
      },
    ];

    const reqList: import("../contracts/schema/types.js").Requirement[] = requirements.map((r) => ({
      requirement_id: r.requirement_id,
      statement: r.statement,
      evidence_ids: [evidenceId],
    }));

    const draftBundle: ResearchBundle = {
      prompt_id: promptId,
      prompt: {
        prompt_id: promptId,
        intent: goal,
        requested_outcome: outcome,
        context: [{ context_id: `ctx:${runId}`, statement: outcome }],
        research_direction: ["initial draft"],
      },
      researcher: {
        researcher_id: researcherId,
        prompt_id: promptId,
        plan_id: planId,
        schema_id: schemaId,
        fixture_id: fixtureId,
        goal_id: goalId,
        validation_id: validationId,
        requirement_ids: reqList.map((r) => r.requirement_id),
        evidence: evidenceList,
        success_definition: {
          success_criteria_ids: [`criterion:${runId}`],
          success_meaning: outcome,
          evidence_ids: [evidenceId],
        },
      },
      plan: {
        plan_id: planId,
        researcher_id: researcherId,
        requirements: reqList,
        dependencies: [],
        steps: [
          {
            step_id: "step-1",
            description: outcome,
            responsibility: "builder",
            depends_on: [],
            requirement_refs: reqList.map((r) => r.requirement_id),
            goal_refs: [goalId],
            fixture_refs: [fixtureId],
            schema_refs: [schemaId],
          },
        ],
        revision: 1,
        revision_evidence: [],
      },
      schema_artifact: {
        schema_id: schemaId,
        researcher_id: researcherId,
        target: "workflow",
        schema_document: { type: "object" },
        evidence_ids: [evidenceId],
      },
      fixture: {
        fixture_id: fixtureId,
        researcher_id: researcherId,
        plan_assertions: [],
      },
      goal: {
        goal_id: goalId,
        researcher_id: researcherId,
        objective: goal,
        success_meaning: outcome,
        success_criteria: [
          {
            criterion_id: `criterion:${runId}`,
            statement: outcome,
            measurement: "deterministic-pass",
            expected_result: "success",
            evidence_ids: [evidenceId],
          },
        ],
      },
      validation: {
        validation_id: validationId,
        researcher_id: researcherId,
        plan_id: planId,
        schema_validation: { plan_id: planId, schema_id: schemaId },
        fixture_validation: { plan_id: planId, fixture_id: fixtureId, assertion_ids: [] },
        goal_validation: { plan_id: planId, goal_id: goalId, criterion_ids: [`criterion:${runId}`] },
      },
    };

    const review: PlanReview = {
      run_id: runId,
      revision: 1,
      status: "pending",
      created_at: new Date().toISOString(),
      research: draftBundle,
      edits: {
        objective: goal,
        requirements: requirements.map((r) => ({
          id: r.requirement_id,
          statement: r.statement,
        })),
        steps: [
          {
            id: "step-1",
            description: outcome,
          },
        ],
        notes: [],
      },
      conversation_id: conversationId,
      conversation_revision: conv?.intent.revision,
      conversation_hash: conv?.conversation_hash,
    };

    await this.artifactStore.save(runId, "review", review);
    return review;
  }

  private resolveRunIdForConversation(conversationId: string): string | undefined {
    // Check in-memory run snapshots for matching conversation_id in route_snapshot or metadata
    for (const snap of this.runs.list()) {
      if (snap.route_snapshot && (snap.route_snapshot as any).conversation_id === conversationId) {
        return snap.run_id;
      }
      if (snap.artifacts && snap.artifacts[`conversation:${conversationId}`]) {
        return snap.run_id;
      }
    }
    // Fallback: convention-based matching runId === conversationId or run:conversationId
    const directSnap = this.runs.get(conversationId);
    if (directSnap) return conversationId;

    return undefined;
  }
}
