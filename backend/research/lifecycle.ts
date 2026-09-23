/**
 * OneShot Research Lifecycle
 *
 * Manages research phases, refinement cycles, quality gates, and validation steps.
 * Coordinates researcher operations and tracks research state.
 *
 * Pattern: Extracted from Pydantic architecture research lifecycle management
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../validation/failure-taxonomy.js';

/**
 * Research phase types
 */
export enum ResearchPhase {
  Planning = 'planning',
  Exploration = 'exploration',
  Analysis = 'analysis',
  Synthesis = 'synthesis',
  Validation = 'validation',
  Complete = 'complete',
}

/**
 * Research quality levels
 */
export enum QualityLevel {
  Draft = 0,
  Acceptable = 1,
  Good = 2,
  Excellent = 3,
}

/**
 * Refinement cycle record
 */
export interface RefinementCycle {
  cycleNumber: number;
  phase: ResearchPhase;
  startedAt: number;
  completedAt?: number;
  qualityScore: number;
  findings: unknown;
  issues?: string[];
  nextActions?: string[];
}

/**
 * Research metadata
 */
export interface ResearchMetadata {
  id: string;
  title: string;
  description?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
  tags?: string[];
  objectives?: string[];
}

/**
 * Research quality gate definition
 */
export interface QualityGate {
  name: string;
  minScore: number;
  checks: string[];
  required: boolean;
}

/**
 * Research record
 */
export interface ResearchRecord {
  id: string;
  phase: ResearchPhase;
  metadata: ResearchMetadata;
  cycles: RefinementCycle[];
  currentCycle: number;
  maxCycles: number;
  qualityThreshold: number;
  currentQuality: number;
  qualityGates: QualityGate[];
  completed: boolean;
}

/**
 * Research lifecycle event
 */
export type ResearchLifecycleEvent =
  | { type: 'started'; research: ResearchRecord }
  | { type: 'phase-changed'; research: ResearchRecord; from: ResearchPhase; to: ResearchPhase }
  | { type: 'cycle-completed'; research: ResearchRecord; cycle: RefinementCycle }
  | { type: 'quality-gate-passed'; research: ResearchRecord; gate: QualityGate }
  | { type: 'quality-gate-failed'; research: ResearchRecord; gate: QualityGate }
  | { type: 'max-cycles-reached'; research: ResearchRecord }
  | { type: 'completed'; research: ResearchRecord };

/**
 * Research lifecycle event listener
 */
export type ResearchLifecycleEventListener = (event: ResearchLifecycleEvent) => void | Promise<void>;

/**
 * Research lifecycle manager
 */
export class ResearchLifecycleManager {
  private research: Map<string, ResearchRecord> = new Map();
  private listeners: ResearchLifecycleEventListener[] = [];
  private phaseTransitions: Map<ResearchPhase, ResearchPhase[]> = new Map([
    [ResearchPhase.Planning, [ResearchPhase.Exploration]],
    [ResearchPhase.Exploration, [ResearchPhase.Analysis, ResearchPhase.Exploration]],
    [ResearchPhase.Analysis, [ResearchPhase.Synthesis, ResearchPhase.Exploration]],
    [ResearchPhase.Synthesis, [ResearchPhase.Validation, ResearchPhase.Analysis]],
    [ResearchPhase.Validation, [ResearchPhase.Complete, ResearchPhase.Exploration]],
    [ResearchPhase.Complete, []],
  ]);

  /**
   * Start new research
   */
  startResearch(
    id: string,
    title: string,
    maxCycles: number = 5,
    qualityThreshold: number = QualityLevel.Good,
    gates?: QualityGate[]
  ): ResearchRecord {
    if (this.research.has(id)) {
      throw new Error(`Research '${id}' already exists`);
    }

    const now = Date.now();
    const record: ResearchRecord = {
      id,
      phase: ResearchPhase.Planning,
      metadata: {
        id,
        title,
        createdAt: now,
        updatedAt: now,
      },
      cycles: [],
      currentCycle: 0,
      maxCycles,
      qualityThreshold,
      currentQuality: QualityLevel.Draft,
      qualityGates: gates || this.getDefaultQualityGates(),
      completed: false,
    };

    this.research.set(id, record);
    this.emit({ type: 'started', research: record });

    return record;
  }

  /**
   * Get research by ID
   */
  getResearch(id: string): ResearchRecord | undefined {
    return this.research.get(id);
  }

  /**
   * Advance research phase
   */
  advancePhase(id: string, toPhase: ResearchPhase, reason?: string): ValidationResult<ResearchRecord> {
    const research = this.research.get(id);
    if (!research) {
      return validationError({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: `Research '${id}' not found`,
        timestamp: Date.now(),
      });
    }

    const allowedTransitions = this.phaseTransitions.get(research.phase) || [];
    if (!allowedTransitions.includes(toPhase)) {
      return validationError({
        type: FailureType.TransitionFailed,
        severity: FailureSeverity.Error,
        message: `Cannot transition from ${research.phase} to ${toPhase}`,
        timestamp: Date.now(),
      });
    }

    const from = research.phase;
    research.phase = toPhase;
    research.metadata.updatedAt = Date.now();

    this.emit({ type: 'phase-changed', research, from, to: toPhase });

    if (toPhase === ResearchPhase.Complete) {
      research.completed = true;
      this.emit({ type: 'completed', research });
    }

    return validationSuccess(research);
  }

  /**
   * Complete refinement cycle
   */
  completeCycle(
    id: string,
    findings: unknown,
    qualityScore: number,
    issues?: string[]
  ): ValidationResult<ResearchRecord> {
    const research = this.research.get(id);
    if (!research) {
      return validationError({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: `Research '${id}' not found`,
        timestamp: Date.now(),
      });
    }

    if (research.currentCycle >= research.maxCycles) {
      this.emit({ type: 'max-cycles-reached', research });
      return validationError({
        type: FailureType.ValidationCycleMaxed,
        severity: FailureSeverity.Warning,
        message: `Max cycles (${research.maxCycles}) reached`,
        timestamp: Date.now(),
      });
    }

    const cycle: RefinementCycle = {
      cycleNumber: research.currentCycle + 1,
      phase: research.phase,
      startedAt: Date.now() - 1000, // Simplified; would be tracked separately
      completedAt: Date.now(),
      qualityScore,
      findings,
      issues,
    };

    research.cycles.push(cycle);
    research.currentCycle += 1;
    research.currentQuality = Math.max(research.currentQuality, qualityScore);
    research.metadata.updatedAt = Date.now();

    this.emit({ type: 'cycle-completed', research, cycle });

    // Check quality gates
    const gateResult = this.evaluateQualityGates(research);
    if (!gateResult.ok && gateResult.failedGate) {
      this.emit({ type: 'quality-gate-failed', research, gate: gateResult.failedGate });
      return validationError({
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Warning,
        message: `Quality gate failed: ${gateResult.failedGate.name}`,
        timestamp: Date.now(),
      });
    }

    if (gateResult.passedGate) {
      this.emit({ type: 'quality-gate-passed', research, gate: gateResult.passedGate });
    }

    return validationSuccess(research);
  }

  /**
   * Evaluate quality gates
   */
  private evaluateQualityGates(
    research: ResearchRecord
  ): {
    ok: boolean;
    passedGate?: QualityGate;
    failedGate?: QualityGate;
  } {
    for (const gate of research.qualityGates) {
      if (research.currentQuality >= gate.minScore) {
        return { ok: true, passedGate: gate };
      }

      if (gate.required) {
        return { ok: false, failedGate: gate };
      }
    }

    return { ok: true };
  }

  /**
   * Get default quality gates
   */
  private getDefaultQualityGates(): QualityGate[] {
    return [
      {
        name: 'minimum-quality',
        minScore: QualityLevel.Acceptable,
        checks: ['has-findings', 'has-no-critical-issues'],
        required: true,
      },
      {
        name: 'good-quality',
        minScore: QualityLevel.Good,
        checks: ['has-analysis', 'has-recommendations'],
        required: false,
      },
      {
        name: 'excellent-quality',
        minScore: QualityLevel.Excellent,
        checks: ['comprehensive', 'actionable', 'validated'],
        required: false,
      },
    ];
  }

  /**
   * Subscribe to lifecycle events
   */
  on(listener: ResearchLifecycleEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Unsubscribe from lifecycle events
   */
  off(listener: ResearchLifecycleEventListener): boolean {
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
  private emit(event: ResearchLifecycleEvent): void {
    for (const listener of this.listeners) {
      Promise.resolve(listener(event)).catch((error) => {
        console.error('Research lifecycle event listener error:', error);
      });
    }
  }

  /**
   * Get all research
   */
  getAllResearch(): ResearchRecord[] {
    return Array.from(this.research.values());
  }

  /**
   * Get research by phase
   */
  getResearchByPhase(phase: ResearchPhase): ResearchRecord[] {
    return Array.from(this.research.values()).filter((r) => r.phase === phase);
  }

  /**
   * Get completed research
   */
  getCompleted(): ResearchRecord[] {
    return Array.from(this.research.values()).filter((r) => r.completed);
  }

  /**
   * Clear all research
   */
  clear(): void {
    this.research.clear();
  }

  /**
   * Get research count
   */
  count(): number {
    return this.research.size;
  }
}
