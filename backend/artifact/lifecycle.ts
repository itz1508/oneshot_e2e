/**
 * OneShot Artifact Lifecycle
 *
 * Manages artifact state transitions, versioning, retention policies,
 * and lifecycle events (creation, validation, archival, deletion).
 *
 * Pattern: Extracted from Pydantic architecture artifact lifecycle management
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../validation/failure-taxonomy.js';

/**
 * Artifact state lifecycle
 */
export enum ArtifactState {
  Draft = 'draft',
  Validated = 'validated',
  Published = 'published',
  Archived = 'archived',
  Deleted = 'deleted',
}

/**
 * Artifact version information
 */
export interface ArtifactVersion {
  version: string; // semantic: 1.0.0
  created: number;
  hash: string;
  size: number;
  deprecated?: boolean;
  deprecatedAt?: number;
}

/**
 * Artifact metadata
 */
export interface ArtifactMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  tags?: string[];
  metadata?: Record<string, unknown>;
}

/**
 * Artifact retention policy
 */
export interface RetentionPolicy {
  maxVersions: number;
  maxAge: number; // milliseconds
  archiveAfter: number; // milliseconds
  deleteAfter: number; // milliseconds
  allowPurge: boolean;
}

/**
 * Artifact state record
 */
export interface ArtifactRecord {
  id: string;
  state: ArtifactState;
  currentVersion: ArtifactVersion;
  versions: ArtifactVersion[];
  metadata: ArtifactMetadata;
  retentionPolicy: RetentionPolicy;
  transitions: StateTransition[];
}

/**
 * State transition record
 */
export interface StateTransition {
  from: ArtifactState;
  to: ArtifactState;
  timestamp: number;
  reason?: string;
  actor?: string;
}

/**
 * Lifecycle event
 */
export type ArtifactLifecycleEvent =
  | { type: 'created'; artifact: ArtifactRecord }
  | { type: 'validated'; artifact: ArtifactRecord }
  | { type: 'published'; artifact: ArtifactRecord }
  | { type: 'archived'; artifact: ArtifactRecord }
  | { type: 'versioned'; artifact: ArtifactRecord; version: ArtifactVersion }
  | { type: 'deleted'; artifactId: string };

/**
 * Lifecycle event listener
 */
export type LifecycleEventListener = (event: ArtifactLifecycleEvent) => void | Promise<void>;

/**
 * Default retention policies
 */
export const DEFAULT_RETENTION_POLICIES = {
  shortLived: {
    maxVersions: 3,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    archiveAfter: 12 * 60 * 60 * 1000, // 12 hours
    deleteAfter: 24 * 60 * 60 * 1000, // 24 hours
    allowPurge: true,
  } as RetentionPolicy,

  standard: {
    maxVersions: 10,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    archiveAfter: 7 * 24 * 60 * 60 * 1000, // 7 days
    deleteAfter: 30 * 24 * 60 * 60 * 1000, // 30 days
    allowPurge: true,
  } as RetentionPolicy,

  longLived: {
    maxVersions: 100,
    maxAge: 365 * 24 * 60 * 60 * 1000, // 1 year
    archiveAfter: 90 * 24 * 60 * 60 * 1000, // 90 days
    deleteAfter: 365 * 24 * 60 * 60 * 1000, // 1 year
    allowPurge: false,
  } as RetentionPolicy,
};

/**
 * Artifact lifecycle manager
 */
export class ArtifactLifecycleManager {
  private artifacts: Map<string, ArtifactRecord> = new Map();
  private listeners: LifecycleEventListener[] = [];
  private stateTransitions: Map<ArtifactState, ArtifactState[]> = new Map([
    [ArtifactState.Draft, [ArtifactState.Validated, ArtifactState.Deleted]],
    [ArtifactState.Validated, [ArtifactState.Published, ArtifactState.Draft, ArtifactState.Deleted]],
    [ArtifactState.Published, [ArtifactState.Archived, ArtifactState.Deleted]],
    [ArtifactState.Archived, [ArtifactState.Published, ArtifactState.Deleted]],
    [ArtifactState.Deleted, []],
  ]);

  /**
   * Create a new artifact
   */
  createArtifact(
    id: string,
    name: string,
    version: ArtifactVersion,
    policy?: RetentionPolicy,
    metadata?: Partial<ArtifactMetadata>
  ): ArtifactRecord {
    if (this.artifacts.has(id)) {
      throw new Error(`Artifact '${id}' already exists`);
    }

    const now = Date.now();
    const record: ArtifactRecord = {
      id,
      state: ArtifactState.Draft,
      currentVersion: version,
      versions: [version],
      metadata: {
        id,
        name,
        createdAt: now,
        updatedAt: now,
        ...metadata,
      },
      retentionPolicy: policy || DEFAULT_RETENTION_POLICIES.standard,
      transitions: [],
    };

    this.artifacts.set(id, record);
    this.emit({ type: 'created', artifact: record });

    return record;
  }

  /**
   * Get artifact by ID
   */
  getArtifact(id: string): ArtifactRecord | undefined {
    return this.artifacts.get(id);
  }

  /**
   * Transition artifact to new state
   */
  transitionState(
    id: string,
    toState: ArtifactState,
    reason?: string,
    actor?: string
  ): ValidationResult<ArtifactRecord> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      return validationError({
        type: FailureType.ArtifactMissing,
        severity: FailureSeverity.Error,
        message: `Artifact '${id}' not found`,
        timestamp: Date.now(),
      });
    }

    const allowedTransitions = this.stateTransitions.get(artifact.state) || [];
    if (!allowedTransitions.includes(toState)) {
      return validationError({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: `Cannot transition from ${artifact.state} to ${toState}`,
        timestamp: Date.now(),
      });
    }

    const transition: StateTransition = {
      from: artifact.state,
      to: toState,
      timestamp: Date.now(),
      reason,
      actor,
    };

    artifact.state = toState;
    artifact.transitions.push(transition);
    artifact.metadata.updatedAt = Date.now();

    if (toState === ArtifactState.Validated) {
      this.emit({ type: 'validated', artifact });
    } else if (toState === ArtifactState.Published) {
      this.emit({ type: 'published', artifact });
    } else if (toState === ArtifactState.Archived) {
      this.emit({ type: 'archived', artifact });
    } else if (toState === ArtifactState.Deleted) {
      this.emit({ type: 'deleted', artifactId: id });
      this.artifacts.delete(id);
    }

    return validationSuccess(artifact);
  }

  /**
   * Add a new version to an artifact
   */
  addVersion(id: string, version: ArtifactVersion): ValidationResult<ArtifactRecord> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      return validationError({
        type: FailureType.ArtifactMissing,
        severity: FailureSeverity.Error,
        message: `Artifact '${id}' not found`,
        timestamp: Date.now(),
      });
    }

    artifact.versions.push(version);
    artifact.currentVersion = version;
    artifact.metadata.updatedAt = Date.now();

    // Apply retention policy
    const policy = artifact.retentionPolicy;
    if (artifact.versions.length > policy.maxVersions) {
      artifact.versions = artifact.versions.slice(-policy.maxVersions);
    }

    this.emit({ type: 'versioned', artifact, version });

    return validationSuccess(artifact);
  }

  /**
   * Get version history
   */
  getVersionHistory(id: string): ValidationResult<ArtifactVersion[]> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      return validationError({
        type: FailureType.ArtifactMissing,
        severity: FailureSeverity.Error,
        message: `Artifact '${id}' not found`,
        timestamp: Date.now(),
      });
    }

    return validationSuccess([...artifact.versions]);
  }

  /**
   * Get state transitions
   */
  getTransitionHistory(id: string): ValidationResult<StateTransition[]> {
    const artifact = this.artifacts.get(id);
    if (!artifact) {
      return validationError({
        type: FailureType.ArtifactMissing,
        severity: FailureSeverity.Error,
        message: `Artifact '${id}' not found`,
        timestamp: Date.now(),
      });
    }

    return validationSuccess([...artifact.transitions]);
  }

  /**
   * Subscribe to lifecycle events
   */
  on(listener: LifecycleEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Unsubscribe from lifecycle events
   */
  off(listener: LifecycleEventListener): boolean {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Emit lifecycle event
   */
  private emit(event: ArtifactLifecycleEvent): void {
    for (const listener of this.listeners) {
      Promise.resolve(listener(event)).catch((error) => {
        console.error('Lifecycle event listener error:', error);
      });
    }
  }

  /**
   * Get all artifacts
   */
  getAllArtifacts(): ArtifactRecord[] {
    return Array.from(this.artifacts.values());
  }

  /**
   * Cleanup artifacts based on retention policies
   */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, artifact] of this.artifacts) {
      const policy = artifact.retentionPolicy;

      // Check if artifact exceeds max age
      const age = now - artifact.metadata.createdAt;
      if (age > policy.maxAge && policy.allowPurge) {
        this.artifacts.delete(id);
        this.emit({ type: 'deleted', artifactId: id });
        removed++;
      }

      // Check if should be archived
      const createdAt = artifact.metadata.createdAt;
      if (artifact.state === ArtifactState.Published && now - createdAt > policy.archiveAfter) {
        this.transitionState(id, ArtifactState.Archived, 'Auto-archived by retention policy');
      }
    }

    return removed;
  }

  /**
   * Clear all artifacts
   */
  clear(): void {
    this.artifacts.clear();
  }

  /**
   * Get artifact count
   */
  count(): number {
    return this.artifacts.size;
  }
}
