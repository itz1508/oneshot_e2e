/**
 * OneShot Execution Guards
 *
 * Gate conditions that must be satisfied before a workflow node can execute.
 * Guards provide decision points, validation, and precondition checking.
 *
 * Pattern: Extracted from Pydantic architecture workflow execution guards
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../../validation/failure-taxonomy.js';
import { ConfigScope } from '../../config/boundaries.js';

/**
 * Guard evaluation result
 */
export enum GuardDecision {
  Allow = 'allow',
  Deny = 'deny',
  Retry = 'retry',
}

/**
 * Guard condition that must be satisfied
 */
export interface GuardCondition {
  id: string;
  name: string;
  description: string;
  evaluator: (context: GuardContext) => Promise<GuardDecision | boolean>;
  onDenial?: (context: GuardContext) => ValidationFailure;
}

/**
 * Context passed to guard evaluators
 */
export interface GuardContext {
  nodeId: string;
  nodeType: string;
  scope: ConfigScope;
  timestamp: number;
  metadata?: Record<string, unknown>;
  previousGuards?: GuardEvaluationResult[];
}

/**
 * Result of guard evaluation
 */
export interface GuardEvaluationResult {
  guardId: string;
  decision: GuardDecision;
  duration: number;
  reason?: string;
  failure?: ValidationFailure;
  timestamp: number;
}

/**
 * Registry for managing guards
 */
export class GuardRegistry {
  private guards: Map<string, GuardCondition> = new Map();
  private nodeIndex: Map<string, string[]> = new Map(); // nodeId -> guardIds

  /**
   * Register a guard
   */
  register(guard: GuardCondition): void {
    if (this.guards.has(guard.id)) {
      throw new Error(`Guard '${guard.id}' already registered`);
    }
    this.guards.set(guard.id, guard);
  }

  /**
   * Unregister a guard
   */
  unregister(id: string): boolean {
    if (!this.guards.has(id)) return false;
    this.guards.delete(id);

    // Clean up node index
    for (const [, guardIds] of this.nodeIndex) {
      const idx = guardIds.indexOf(id);
      if (idx >= 0) guardIds.splice(idx, 1);
    }

    return true;
  }

  /**
   * Get a guard by ID
   */
  getGuard(id: string): GuardCondition | undefined {
    return this.guards.get(id);
  }

  /**
   * Get all guards
   */
  getAllGuards(): GuardCondition[] {
    return Array.from(this.guards.values());
  }

  /**
   * Assign guards to a node
   */
  assignToNode(nodeId: string, guardIds: string[]): void {
    for (const guardId of guardIds) {
      if (!this.guards.has(guardId)) {
        throw new Error(`Guard '${guardId}' not registered`);
      }
    }
    this.nodeIndex.set(nodeId, guardIds);
  }

  /**
   * Get guards for a node
   */
  getGuardsForNode(nodeId: string): GuardCondition[] {
    const guardIds = this.nodeIndex.get(nodeId) || [];
    return guardIds.map((id) => this.guards.get(id)!).filter(Boolean);
  }

  /**
   * Clear all guards
   */
  clear(): void {
    this.guards.clear();
    this.nodeIndex.clear();
  }

  /**
   * Get guard count
   */
  count(): number {
    return this.guards.size;
  }
}

/**
 * Guard evaluator - evaluates guards and makes decisions
 */
export class GuardEvaluator {
  private registry: GuardRegistry;
  private evaluationHistory: GuardEvaluationResult[] = [];
  private maxHistorySize: number = 1000;

  constructor(registry?: GuardRegistry) {
    this.registry = registry || new GuardRegistry();
  }

  /**
   * Evaluate all guards for a node
   */
  async evaluateNodeGuards(context: GuardContext): Promise<ValidationResult<GuardDecision>> {
    const guards = this.registry.getGuardsForNode(context.nodeId);
    const results: GuardEvaluationResult[] = [];
    const failures: ValidationFailure[] = [];

    for (const guard of guards) {
      const startTime = performance.now();

      try {
        let decision: GuardDecision;
        const guardResult = await guard.evaluator({ ...context, previousGuards: results });

        if (typeof guardResult === 'boolean') {
          decision = guardResult ? GuardDecision.Allow : GuardDecision.Deny;
        } else {
          decision = guardResult;
        }

        const duration = performance.now() - startTime;
        const result: GuardEvaluationResult = {
          guardId: guard.id,
          decision,
          duration,
          timestamp: Date.now(),
        };

        results.push(result);
        this.evaluationHistory.push(result);

        // If any guard denies, record failure and stop
        if (decision === GuardDecision.Deny) {
          const failure =
            guard.onDenial?.(context) ||
            {
              type: FailureType.NodeFailed,
              severity: FailureSeverity.Warning,
              message: `Guard '${guard.id}' (${guard.name}) denied execution`,
              timestamp: Date.now(),
            };

          failures.push(failure);
          return validationError<GuardDecision>(...failures);
        }

        // If any guard retries, return Retry decision
        if (decision === GuardDecision.Retry) {
          return validationSuccess<GuardDecision>(GuardDecision.Retry);
        }
      } catch (error) {
        const duration = performance.now() - startTime;
        const failure: ValidationFailure = {
          type: FailureType.ExecutionFailed,
          severity: FailureSeverity.Error,
          message: `Guard '${guard.id}' evaluation failed`,
          originalErrorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };

        const result: GuardEvaluationResult = {
          guardId: guard.id,
          decision: GuardDecision.Deny,
          duration,
          failure,
          timestamp: Date.now(),
        };

        results.push(result);
        this.evaluationHistory.push(result);
        failures.push(failure);

        return validationError<GuardDecision>(...failures);
      }
    }

    // All guards allowed
    return validationSuccess<GuardDecision>(GuardDecision.Allow);
  }

  /**
   * Evaluate a specific guard
   */
  async evaluateGuard(guardId: string, context: GuardContext): Promise<GuardEvaluationResult> {
    const guard = this.registry.getGuard(guardId);
    if (!guard) {
      throw new Error(`Guard '${guardId}' not found`);
    }

    const startTime = performance.now();

    try {
      let decision: GuardDecision;
      const guardResult = await guard.evaluator(context);

      if (typeof guardResult === 'boolean') {
        decision = guardResult ? GuardDecision.Allow : GuardDecision.Deny;
      } else {
        decision = guardResult;
      }

      const duration = performance.now() - startTime;
      const result: GuardEvaluationResult = {
        guardId,
        decision,
        duration,
        timestamp: Date.now(),
      };

      this.evaluationHistory.push(result);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const result: GuardEvaluationResult = {
        guardId,
        decision: GuardDecision.Deny,
        duration,
        failure: {
          type: FailureType.ExecutionFailed,
          severity: FailureSeverity.Error,
          message: `Guard execution failed: ${error instanceof Error ? error.message : String(error)}`,
          originalErrorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        },
        timestamp: Date.now(),
      };

      this.evaluationHistory.push(result);
      return result;
    }
  }

  /**
   * Get evaluation history
   */
  getHistory(limit?: number): GuardEvaluationResult[] {
    const history = [...this.evaluationHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.evaluationHistory = [];
  }

  /**
   * Get the registry
   */
  getRegistry(): GuardRegistry {
    return this.registry;
  }

  /**
   * Set a new registry
   */
  setRegistry(registry: GuardRegistry): void {
    this.registry = registry;
  }
}

/**
 * Builder for creating guards fluently
 */
export class GuardBuilder {
  private guard: Partial<GuardCondition> = {};

  withId(id: string): this {
    this.guard.id = id;
    return this;
  }

  withName(name: string): this {
    this.guard.name = name;
    return this;
  }

  withDescription(description: string): this {
    this.guard.description = description;
    return this;
  }

  withEvaluator(evaluator: (context: GuardContext) => Promise<GuardDecision | boolean>): this {
    this.guard.evaluator = evaluator;
    return this;
  }

  withDenialHandler(handler: (context: GuardContext) => ValidationFailure): this {
    this.guard.onDenial = handler;
    return this;
  }

  build(): GuardCondition {
    if (!this.guard.id) throw new Error('Guard must have an id');
    if (!this.guard.name) throw new Error('Guard must have a name');
    if (!this.guard.description) throw new Error('Guard must have a description');
    if (!this.guard.evaluator) throw new Error('Guard must have an evaluator');

    return this.guard as GuardCondition;
  }
}
