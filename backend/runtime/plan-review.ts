import type { ResearchBundle } from "../contracts/schema/types.js";
import type { ArtifactStore } from "./artifact-store.js";

export interface PlanReviewEdits {
  objective: string;
  requirements: Array<{ id: string; statement: string }>;
  steps: Array<{ id: string; description: string }>;
  notes: string[];
}
export interface PlanReview {
  run_id: string;
  revision: number;
  status: "pending" | "approved" | "cancelled";
  created_at: string;
  confirmed_at?: string;
  research: ResearchBundle;
  edits: PlanReviewEdits;
}
export class PlanReviewError extends Error {
  constructor(message: string, readonly status = 409) { super(message); }
}

/** Review state is a support artifact, outside the canonical confirmed core. */
export class PlanReviewService {
  private locks = new Map<string, Promise<void>>();
  constructor(private store: ArtifactStore) {}

  async enable(runId: string): Promise<void> {
    await this.store.save(runId, "review.request", { enabled: true });
  }
  async get(runId: string): Promise<PlanReview | undefined> {
    try { return await this.store.load<PlanReview>(runId, "review"); }
    catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
  }
  async open(runId: string, research: ResearchBundle): Promise<PlanReview | undefined> {
    let requested: { enabled?: boolean };
    try { requested = await this.store.load(runId, "review.request"); }
    catch (error: any) { if (error.code === "ENOENT") return undefined; throw error; }
    if (!requested.enabled) return undefined;
    const review: PlanReview = {
      run_id: runId, revision: 1, status: "pending", created_at: new Date().toISOString(),
      research: structuredClone(research),
      edits: {
        objective: research.goal.objective,
        requirements: research.plan.requirements.map(r => ({ id: r.requirement_id, statement: r.statement })),
        steps: research.plan.steps.map(s => ({ id: s.step_id, description: s.description })),
        notes: [],
      },
    };
    await this.store.save(runId, "review", review);
    return review;
  }

  async decide(runId: string, input: Record<string, unknown>): Promise<PlanReview> {
    const previous = this.locks.get(runId) ?? Promise.resolve();
    let release!: () => void;
    const lock = new Promise<void>(resolve => { release = resolve; });
    this.locks.set(runId, lock);
    await previous;
    try {
      const review = await this.get(runId);
      if (!review) throw new PlanReviewError("No draft is awaiting review", 404);
      if (review.status !== "pending") throw new PlanReviewError("This review has already been decided");
      if (input.revision !== review.revision) throw new PlanReviewError("Review changed; reload the current draft");
      if (input.action !== "approve" && input.action !== "cancel") throw new PlanReviewError("Choose approve or cancel", 400);
      if (input.action === "approve") review.edits = validateEdits(input.edits, review);
      review.status = input.action === "approve" ? "approved" : "cancelled";
      review.revision++;
      review.confirmed_at = new Date().toISOString();
      await this.store.save(runId, "review", review);
      return review;
    } finally {
      release();
      if (this.locks.get(runId) === lock) this.locks.delete(runId);
    }
  }

  async wait(runId: string, isTerminal: () => boolean): Promise<ResearchBundle> {
    const deadline = Date.now() + 24 * 60 * 60 * 1000;
    while (!isTerminal() && Date.now() < deadline) {
      const review = await this.get(runId);
      if (review?.status === "cancelled") throw new Error("Plan review cancelled by the user");
      if (review?.status === "approved") return applyReview(review);
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    throw new Error("Plan review ended before confirmation");
  }
}

function nonempty(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 20000)
    throw new PlanReviewError("Review fields must contain between 1 and 20000 characters", 400);
  return value.trim();
}

function keyedEdits<T extends "statement" | "description">(
  items: unknown,
  originals: Array<{ id: string }>,
  field: T,
): Array<{ id: string } & Record<T, string>> {
  if (!Array.isArray(items) || items.length !== originals.length)
    throw new PlanReviewError("Keep the draft requirement and task identities", 400);
  return originals.map(original => {
    const matches = items.filter(item => item && item.id === original.id);
    if (matches.length !== 1) throw new PlanReviewError("Review contains an unknown or duplicate identity", 400);
    return { id: original.id, [field]: nonempty(matches[0][field]) } as { id: string } & Record<T, string>;
  });
}

export function validatePlanReviewEdits(value: unknown, review: PlanReview): PlanReviewEdits {
  if (!value || typeof value !== "object") throw new PlanReviewError("Review edits are required", 400);
  const edits = value as PlanReviewEdits;
  if (!Array.isArray(edits.notes) || edits.notes.length > 50) throw new PlanReviewError("At most 50 review notes are supported", 400);
  return {
    objective: nonempty(edits.objective),
    requirements: keyedEdits(edits.requirements, review.edits.requirements, "statement") as PlanReviewEdits["requirements"],
    steps: keyedEdits(edits.steps, review.edits.steps, "description") as PlanReviewEdits["steps"],
    notes: edits.notes.map(nonempty),
  };
}

export function applyPlanReviewEdits(review: PlanReview): ResearchBundle {
  const research = structuredClone(review.research);
  research.goal.objective = review.edits.objective;
  for (const requirement of research.plan.requirements) {
    requirement.statement = review.edits.requirements.find(r => r.id === requirement.requirement_id)!.statement;
  }
  for (const step of research.plan.steps) {
    step.description = review.edits.steps.find(s => s.id === step.step_id)!.description;
  }
  research.prompt.context.push(...review.edits.notes.map((statement, index) => ({
    context_id: `review:${review.run_id}:note:${index + 1}`, statement,
  })));
  research.researcher.evidence.push({ evidence_id: `review:${review.run_id}`, source: "user-plan-review",
    statement: JSON.stringify(review.edits), provenance: "user-confirmed-draft" });
  return research;
}

function validateEdits(value: unknown, review: PlanReview): PlanReviewEdits {
  return validatePlanReviewEdits(value, review);
}

function applyReview(review: PlanReview): ResearchBundle {
  return applyPlanReviewEdits(review);
}
