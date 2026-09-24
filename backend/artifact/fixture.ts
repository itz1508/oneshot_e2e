/**
 * OneShot Fixture Runtime & Persistence Artifacts
 *
 * Implements:
 *
 * 1. RUNTIME ARTIFACT RULE:
 *    fixture(...) = Runtime Artifact = Mutable = In Progress = Can Evolve = Can Be Refined = Can Emit Events = Can Fail Validation
 *
 * 2. PERSISTENCE ARTIFACT RULE:
 *    fixture_id = Persistence Artifact = Stored Record = Immutable Reference = Auditable = Retrievable
 */

import { ValidationResult, validationSuccess, validationError, FailureType, FailureSeverity } from "../validation/failure-taxonomy.js";

export type FixtureStatus = "draft" | "in_progress" | "validated" | "persisted" | "failed";

export interface StoredFixtureRecord {
  readonly fixture_id: string; // Immutable Persistence Reference
  readonly session_id: string; // Authoritative Session Anchor
  readonly path: string;
  readonly expectedHash: string;
  readonly actualHash?: string;
  readonly status: FixtureStatus;
  readonly storedAt: string;
  readonly auditTrail: readonly string[];
}

export interface FixtureState {
  fixture_id: string;
  session_id: string;
  path: string;
  expectedHash: string;
  actualHash?: string;
  status: FixtureStatus;
  metadata?: Record<string, unknown>;
}

export interface FixtureLifecycleEvent {
  id: string;
  type: "fixture:created" | "fixture:evolved" | "fixture:refined" | "fixture:validated" | "fixture:failed";
  timestamp: number;
  producerId: string;
  publishAs: string;
  sessionId: string;
  fixtureId: string;
  payload: Record<string, unknown>;
}

/**
 * FixtureRuntime represents fixture(...)
 *
 * Runtime Artifact: Mutable, In Progress, Can Evolve, Can Be Refined, Can Emit Events, Can Fail Validation
 */
export class FixtureRuntime {
  readonly fixture_id: string;
  readonly session_id: string;
  readonly isMutable: true = true;
  isInProgress: boolean = true;
  path: string;
  expectedHash: string;
  actualHash?: string;
  status: FixtureStatus = "draft";
  metadata: Record<string, unknown> = {};
  
  private auditHistory: string[] = [];
  private eventListeners: Array<(event: FixtureLifecycleEvent) => void> = [];

  constructor(fixture_id: string, session_id: string, path: string, expectedHash: string, initial?: Partial<FixtureState>) {
    if (!fixture_id || typeof fixture_id !== "string") {
      throw new Error("Persistence identifier fixture_id is strictly required");
    }
    if (!session_id || typeof session_id !== "string") {
      throw new Error("Authoritative session_id is strictly required for fixture runtime");
    }
    this.fixture_id = fixture_id;
    this.session_id = session_id;
    this.path = path;
    this.expectedHash = expectedHash;
    if (initial?.status) this.status = initial.status;
    if (initial?.actualHash) this.actualHash = initial.actualHash;
    if (initial?.metadata) this.metadata = { ...initial.metadata };

    this.recordAudit(`Created fixture(${fixture_id}) in progress anchored to session_id ${session_id}`);
  }

  // Alias for backward compatibility
  get id(): string {
    return this.fixture_id;
  }

  get sessionId(): string {
    return this.session_id;
  }

  private recordAudit(action: string): void {
    const entry = `[${new Date().toISOString()}] fixture(${this.fixture_id})[${this.session_id}]: ${action}`;
    this.auditHistory.push(entry);
  }

  onEvent(listener: (event: FixtureLifecycleEvent) => void): this {
    this.eventListeners.push(listener);
    return this;
  }

  // Can Evolve
  evolve(patch: Partial<FixtureState>): this {
    if (patch.path !== undefined) this.path = patch.path;
    if (patch.expectedHash !== undefined) this.expectedHash = patch.expectedHash;
    if (patch.actualHash !== undefined) this.actualHash = patch.actualHash;
    if (patch.status !== undefined) this.status = patch.status;
    if (patch.metadata !== undefined) this.metadata = { ...this.metadata, ...patch.metadata };

    this.recordAudit(`Evolved fixture state to status=${this.status}`);
    this.emit("fixture:evolved", { patch });
    return this;
  }

  // Can Be Refined
  refine(refinement: (current: FixtureState) => Partial<FixtureState>): this {
    const currentState: FixtureState = {
      fixture_id: this.fixture_id,
      session_id: this.session_id,
      path: this.path,
      expectedHash: this.expectedHash,
      actualHash: this.actualHash,
      status: this.status,
      metadata: { ...this.metadata },
    };
    const delta = refinement(currentState);
    this.evolve(delta);
    this.recordAudit("Refined fixture parameters");
    this.emit("fixture:refined", { delta });
    return this;
  }

  // Can Emit Events
  emit(type: FixtureLifecycleEvent["type"], payload: Record<string, unknown> = {}, publishAs: string = "FixtureManager"): FixtureLifecycleEvent {
    const event: FixtureLifecycleEvent = {
      id: `evt_fix_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      type,
      timestamp: Date.now(),
      producerId: "FixtureRuntime",
      publishAs,
      sessionId: this.session_id,
      fixtureId: this.fixture_id,
      payload,
    };
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch {
        // Suppress listener error
      }
    }
    this.recordAudit(`Emitted event ${type}`);
    return event;
  }

  // Can Fail Validation
  validate(computeActualHash?: () => string): ValidationResult<StoredFixtureRecord> {
    if (computeActualHash) {
      this.actualHash = computeActualHash();
    }

    if (!this.path) {
      this.status = "failed";
      this.emit("fixture:failed", { reason: "Target file path is empty" });
      return validationError({
        type: FailureType.RequiredFieldMissing,
        severity: FailureSeverity.Error,
        message: `fixture(${this.fixture_id}) path is missing or invalid`,
        path: ["path"],
        timestamp: Date.now(),
      });
    }

    if (this.expectedHash && this.actualHash && this.expectedHash !== this.actualHash) {
      this.status = "failed";
      this.emit("fixture:failed", {
        reason: "Hash mismatch",
        expectedHash: this.expectedHash,
        actualHash: this.actualHash,
      });
      return validationError({
        type: FailureType.HashMismatch,
        severity: FailureSeverity.Critical,
        message: `fixture(${this.fixture_id}) hash mismatch: expected ${this.expectedHash}, received ${this.actualHash}`,
        path: ["expectedHash"],
        context: { expected: this.expectedHash, actual: this.actualHash },
        timestamp: Date.now(),
      });
    }

    this.status = "validated";
    this.emit("fixture:validated", {
      path: this.path,
      expectedHash: this.expectedHash,
      actualHash: this.actualHash,
    });

    return validationSuccess(this.toStoredRecord());
  }

  // Persistence Artifact: Stored Record = Immutable Reference = Auditable = Retrievable
  toStoredRecord(): StoredFixtureRecord {
    this.isInProgress = false;
    this.recordAudit(`Finalized and persisted as fixture_id=${this.fixture_id}`);

    return Object.freeze({
      fixture_id: this.fixture_id,
      session_id: this.session_id,
      path: this.path,
      expectedHash: this.expectedHash,
      actualHash: this.actualHash,
      status: this.status,
      storedAt: new Date().toISOString(),
      auditTrail: Object.freeze([...this.auditHistory]),
    });
  }
}

/**
 * Factory function for fixture(...)
 *
 * Example: fixture("fix-101", "session-202", "app/fixtures/sample.json", "sha256:abc...")
 */
export function fixture(
  fixture_id: string,
  session_id: string,
  path: string,
  expectedHash: string,
  initial?: Partial<FixtureState>
): FixtureRuntime {
  return new FixtureRuntime(fixture_id, session_id, path, expectedHash, initial);
}
