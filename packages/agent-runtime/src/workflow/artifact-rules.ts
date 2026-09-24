/**
 * OneShot Canonical Artifact Rules
 *
 * Implements the fundamental duality:
 *
 * 1. RUNTIME ARTIFACT RULE:
 *    (...) = Runtime Artifact = Mutable = In Progress = Can Evolve = Can Be Refined = Can Emit Events = Can Fail Validation
 *    Examples: session(...), job(...), analysis(...), plan(...), fixture(...), goal(...), schema(...), validation(...), task(...), artifact(...), build(...)
 *
 * 2. PERSISTENCE ARTIFACT RULE:
 *    _id = Persistence Artifact = Stored Record = Immutable Reference = Auditable = Retrievable
 *    Examples: session_id, job_id, plan_id, fixture_id, goal_id, schema_id, validation_id, task_id, artifact_id, build_id
 */

import { BaseWorkflowEvent } from "./types.js";

/**
 * Common validation failure representation for runtime artifacts
 */
export interface ArtifactValidationFailure {
  field?: string;
  message: string;
  rule: string;
  timestamp: string;
  context?: Record<string, unknown>;
}

export interface ArtifactValidationResult<T = unknown> {
  ok: boolean;
  value?: T;
  failures: ArtifactValidationFailure[];
}

/**
 * Persistence Artifact interface
 * Stored Record = Immutable Reference = Auditable = Retrievable
 */
export interface PersistenceArtifact<TId extends string = string, TData = unknown> {
  readonly id: TId; // The immutable _id reference
  readonly isImmutable: true;
  readonly storedAt: string;
  readonly auditTrail: readonly string[];
  readonly data: Readonly<TData>;
}

/**
 * Base Runtime Artifact interface
 * Mutable = In Progress = Can Evolve = Can Be Refined = Can Emit Events = Can Fail Validation
 */
export interface IRuntimeArtifact<TId extends string = string, TState = Record<string, unknown>> {
  readonly id: TId; // Bound immutable persistence reference (_id)
  readonly artifactType: string;
  isMutable: true;
  isInProgress: boolean;
  state: TState;
  
  // Can Evolve
  evolve(patch: Partial<TState>): this;
  
  // Can Be Refined
  refine(refinement: (current: TState) => TState): this;
  
  // Can Emit Events
  emit(type: string, payload: unknown, producerId?: string): BaseWorkflowEvent;
  
  // Can Fail Validation
  validate(): ArtifactValidationResult<TState>;
  
  // Freeze to Persistence Artifact
  toStoredRecord(): PersistenceArtifact<TId, TState>;
}

/**
 * Abstract Generic Runtime Artifact Class
 */
export class RuntimeArtifactBase<TId extends string = string, TState extends Record<string, unknown> = Record<string, unknown>>
  implements IRuntimeArtifact<TId, TState>
{
  readonly id: TId;
  readonly artifactType: string;
  readonly isMutable: true = true;
  isInProgress: boolean = true;
  state: TState;
  private auditHistory: string[] = [];
  private eventListeners: Array<(event: BaseWorkflowEvent) => void> = [];
  private validators: Array<(state: TState) => ArtifactValidationFailure | null> = [];

  constructor(id: TId, artifactType: string, initialState: TState) {
    if (!id || typeof id !== "string") {
      throw new Error(`Persistence identifier (_id) is strictly required for ${artifactType}`);
    }
    this.id = id;
    this.artifactType = artifactType;
    this.state = { ...initialState };
    this.recordAudit(`Created runtime ${artifactType}(...) anchored to ${id}`);
  }

  protected recordAudit(action: string): void {
    const entry = `[${new Date().toISOString()}] ${this.artifactType}(${this.id}): ${action}`;
    this.auditHistory.push(entry);
  }

  addValidator(validator: (state: TState) => ArtifactValidationFailure | null): this {
    this.validators.push(validator);
    return this;
  }

  onEvent(listener: (event: BaseWorkflowEvent) => void): this {
    this.eventListeners.push(listener);
    return this;
  }

  // Can Evolve
  evolve(patch: Partial<TState>): this {
    this.state = { ...this.state, ...patch };
    this.recordAudit(`Evolved with keys: ${Object.keys(patch).join(", ")}`);
    return this;
  }

  // Can Be Refined
  refine(refinement: (current: TState) => TState): this {
    const updated = refinement({ ...this.state });
    this.state = updated;
    this.recordAudit("Refined state via transformer");
    return this;
  }

  // Can Emit Events
  emit(type: string, payload: unknown, producerId: string = "OneShotRuntime"): BaseWorkflowEvent {
    const event: BaseWorkflowEvent = {
      id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type: `${this.artifactType}:${type}`,
      timestamp: Date.now(),
      producerId,
      payload,
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Suppress listener error from crashing artifact lifecycle
      }
    }
    this.recordAudit(`Emitted event: ${event.type}`);
    return event;
  }

  // Can Fail Validation
  validate(): ArtifactValidationResult<TState> {
    const failures: ArtifactValidationFailure[] = [];
    for (const validator of this.validators) {
      const failure = validator(this.state);
      if (failure) {
        failures.push(failure);
      }
    }

    if (failures.length > 0) {
      this.recordAudit(`Validation failed with ${failures.length} errors`);
      return { ok: false, failures };
    }

    this.recordAudit("Validation succeeded");
    return { ok: true, value: this.state, failures: [] };
  }

  // Freeze to Persistence Artifact (Stored Record = Immutable Reference = Auditable = Retrievable)
  toStoredRecord(): PersistenceArtifact<TId, TState> {
    const validation = this.validate();
    if (!validation.ok) {
      throw new Error(
        `Cannot store ${this.artifactType}(${this.id}): failed validation (${validation.failures.map((f) => f.message).join("; ")})`
      );
    }

    this.isInProgress = false;
    this.recordAudit(`Finalized and persisted as ${this.id}`);

    return Object.freeze({
      id: this.id,
      isImmutable: true,
      storedAt: new Date().toISOString(),
      auditTrail: Object.freeze([...this.auditHistory]),
      data: Object.freeze(JSON.parse(JSON.stringify(this.state))),
    });
  }
}

// ---------------------------------------------------------------------------
// The 11 Core Runtime Artifacts and their Factories
// ---------------------------------------------------------------------------

/**
 * 1. session(...) ↔ session_id
 */
export interface SessionState extends Record<string, unknown> {
  session_id: string;
  userId?: string;
  status: "idle" | "running" | "paused" | "completed" | "failed";
  messagesCount: number;
  metadata?: Record<string, unknown>;
}
export class SessionRuntime extends RuntimeArtifactBase<string, SessionState> {
  constructor(session_id: string, initial: Partial<SessionState> = {}) {
    super(session_id, "session", {
      session_id,
      status: "idle",
      messagesCount: 0,
      ...initial,
    });
  }
}
export function session(session_id: string, initial?: Partial<SessionState>): SessionRuntime {
  return new SessionRuntime(session_id, initial);
}

/**
 * 2. job(...) ↔ job_id
 */
export interface JobState extends Record<string, unknown> {
  job_id: string;
  session_id: string;
  stage: string;
  progress: number; // 0-100
  status: "queued" | "running" | "completed" | "failed";
  result?: unknown;
}
export class JobRuntime extends RuntimeArtifactBase<string, JobState> {
  constructor(job_id: string, initial: Partial<JobState> = {}) {
    super(job_id, "job", {
      job_id,
      session_id: (initial.session_id as string) || "session_default",
      stage: "init",
      progress: 0,
      status: "queued",
      ...initial,
    });
  }
}
export function job(job_id: string, initial?: Partial<JobState>): JobRuntime {
  return new JobRuntime(job_id, initial);
}

/**
 * 3. analysis(...) ↔ analysis_id
 */
export interface AnalysisState extends Record<string, unknown> {
  analysis_id: string;
  session_id: string;
  findings: string[];
  score: number;
  status: "draft" | "synthesizing" | "verified" | "failed";
}
export class AnalysisRuntime extends RuntimeArtifactBase<string, AnalysisState> {
  constructor(analysis_id: string, initial: Partial<AnalysisState> = {}) {
    super(analysis_id, "analysis", {
      analysis_id,
      session_id: (initial.session_id as string) || "session_default",
      findings: [],
      score: 0,
      status: "draft",
      ...initial,
    });
  }
}
export function analysis(analysis_id: string, initial?: Partial<AnalysisState>): AnalysisRuntime {
  return new AnalysisRuntime(analysis_id, initial);
}

/**
 * 4. plan(...) ↔ plan_id
 */
export interface PlanState extends Record<string, unknown> {
  plan_id: string;
  session_id: string;
  steps: string[];
  version: number;
  coreHash?: string;
  status: "draft" | "refining" | "approved" | "rejected";
}
export class PlanRuntime extends RuntimeArtifactBase<string, PlanState> {
  constructor(plan_id: string, initial: Partial<PlanState> = {}) {
    super(plan_id, "plan", {
      plan_id,
      session_id: (initial.session_id as string) || "session_default",
      steps: [],
      version: 1,
      status: "draft",
      ...initial,
    });
  }
}
export function plan(plan_id: string, initial?: Partial<PlanState>): PlanRuntime {
  return new PlanRuntime(plan_id, initial);
}

/**
 * 5. fixture(...) ↔ fixture_id
 */
export interface FixtureState extends Record<string, unknown> {
  fixture_id: string;
  session_id: string;
  path: string;
  expectedHash?: string;
  actualHash?: string;
  content?: string;
  status: "draft" | "in_progress" | "validated" | "persisted" | "failed";
}
export class FixtureRuntime extends RuntimeArtifactBase<string, FixtureState> {
  constructor(fixture_id: string, session_id: string, initial: Partial<FixtureState> = {}) {
    super(fixture_id, "fixture", {
      fixture_id,
      session_id,
      path: "",
      status: "draft",
      ...initial,
    });

    // Default fixture validation rule: path and session_id must not be empty
    this.addValidator((s) => {
      if (!s.session_id) {
        return {
          field: "session_id",
          message: "fixture(...) requires an authoritative session_id persistence anchor",
          rule: "SESSION_ID_REQUIRED",
          timestamp: new Date().toISOString(),
        };
      }
      if (!s.path) {
        return {
          field: "path",
          message: "fixture(...) requires a valid target file path",
          rule: "PATH_REQUIRED",
          timestamp: new Date().toISOString(),
        };
      }
      if (s.expectedHash && s.actualHash && s.expectedHash !== s.actualHash) {
        return {
          field: "actualHash",
          message: `fixture(${s.fixture_id}) hash mismatch: expected ${s.expectedHash}, got ${s.actualHash}`,
          rule: "HASH_MISMATCH",
          timestamp: new Date().toISOString(),
        };
      }
      return null;
    });
  }
}
export function fixture(fixture_id: string, session_id: string, initial?: Partial<FixtureState>): FixtureRuntime {
  return new FixtureRuntime(fixture_id, session_id, initial);
}

/**
 * 6. goal(...) ↔ goal_id
 */
export interface GoalState extends Record<string, unknown> {
  goal_id: string;
  session_id: string;
  description: string;
  successCriteria: string[];
  status: "pending" | "in_progress" | "satisfied" | "violated";
}
export class GoalRuntime extends RuntimeArtifactBase<string, GoalState> {
  constructor(goal_id: string, initial: Partial<GoalState> = {}) {
    super(goal_id, "goal", {
      goal_id,
      session_id: (initial.session_id as string) || "session_default",
      description: "",
      successCriteria: [],
      status: "pending",
      ...initial,
    });
  }
}
export function goal(goal_id: string, initial?: Partial<GoalState>): GoalRuntime {
  return new GoalRuntime(goal_id, initial);
}

/**
 * 7. schema(...) ↔ schema_id
 */
export interface SchemaState extends Record<string, unknown> {
  schema_id: string;
  title: string;
  version: string;
  schemaContract: Record<string, unknown>;
  status: "draft" | "active" | "deprecated";
}
export class SchemaRuntime extends RuntimeArtifactBase<string, SchemaState> {
  constructor(schema_id: string, initial: Partial<SchemaState> = {}) {
    super(schema_id, "schema", {
      schema_id,
      title: "",
      version: "1.0.0",
      schemaContract: {},
      status: "draft",
      ...initial,
    });
  }
}
export function schema(schema_id: string, initial?: Partial<SchemaState>): SchemaRuntime {
  return new SchemaRuntime(schema_id, initial);
}

/**
 * 8. validation(...) ↔ validation_id
 */
export interface ValidationState extends Record<string, unknown> {
  validation_id: string;
  session_id: string;
  targetId: string;
  targetType: string;
  passed: boolean;
  errors: string[];
  status: "pending" | "evaluating" | "validated" | "failed";
}
export class ValidationRuntimeEntity extends RuntimeArtifactBase<string, ValidationState> {
  constructor(validation_id: string, initial: Partial<ValidationState> = {}) {
    super(validation_id, "validation", {
      validation_id,
      session_id: (initial.session_id as string) || "session_default",
      targetId: "",
      targetType: "",
      passed: false,
      errors: [],
      status: "pending",
      ...initial,
    });
  }
}
export function validation(validation_id: string, initial?: Partial<ValidationState>): ValidationRuntimeEntity {
  return new ValidationRuntimeEntity(validation_id, initial);
}

/**
 * 9. task(...) ↔ task_id
 */
export interface TaskState extends Record<string, unknown> {
  task_id: string;
  session_id: string;
  title: string;
  stage: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  subtasks: Array<{ id: string; title: string; done: boolean }>;
}
export class TaskRuntime extends RuntimeArtifactBase<string, TaskState> {
  constructor(task_id: string, initial: Partial<TaskState> = {}) {
    super(task_id, "task", {
      task_id,
      session_id: (initial.session_id as string) || "session_default",
      title: "",
      stage: "research",
      status: "pending",
      subtasks: [],
      ...initial,
    });
  }
}
export function task(task_id: string, initial?: Partial<TaskState>): TaskRuntime {
  return new TaskRuntime(task_id, initial);
}

/**
 * 10. artifact(...) ↔ artifact_id
 */
export interface ArtifactStateData extends Record<string, unknown> {
  artifact_id: string;
  session_id: string;
  name: string;
  state: "draft" | "validated" | "published" | "archived" | "deleted";
  version: string;
  content?: string;
  hash?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}
export class ArtifactRuntime extends RuntimeArtifactBase<string, ArtifactStateData> {
  constructor(artifact_id: string, initial: Partial<ArtifactStateData> = {}) {
    super(artifact_id, "artifact", {
      artifact_id,
      session_id: (initial.session_id as string) || "session_default",
      name: "",
      state: "draft",
      version: "1.0.0",
      ...initial,
    });
  }
}
export function artifact(artifact_id: string, initial?: Partial<ArtifactStateData>): ArtifactRuntime {
  return new ArtifactRuntime(artifact_id, initial);
}

/**
 * 11. build(...) ↔ build_id
 */
export interface BuildState extends Record<string, unknown> {
  build_id: string;
  session_id: string;
  commitHash: string;
  coreHash?: string;
  status: "queued" | "building" | "completed" | "failed";
  artifactsProduced: string[];
}
export class BuildRuntime extends RuntimeArtifactBase<string, BuildState> {
  constructor(build_id: string, initial: Partial<BuildState> = {}) {
    super(build_id, "build", {
      build_id,
      session_id: (initial.session_id as string) || "session_default",
      commitHash: "",
      status: "queued",
      artifactsProduced: [],
      ...initial,
    });
  }
}
export function build(build_id: string, initial?: Partial<BuildState>): BuildRuntime {
  return new BuildRuntime(build_id, initial);
}
