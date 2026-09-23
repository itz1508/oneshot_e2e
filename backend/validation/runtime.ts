/**
 * OneShot Validation Runtime
 *
 * Executes validation rules in a controlled runtime context with audit trail,
 * error recovery, and performance monitoring.
 *
 * Pattern: Extracted from Pydantic architecture runtime execution model
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from './failure-taxonomy.js';
import { ConfigScope } from '../config/boundaries.js';

/**
 * Validation rule definition
 */
export interface ValidationRule {
  id: string;
  name: string;
  scope: ConfigScope;
  priority: number; // 0-100, higher = execute first
  predicate: (value: unknown, context?: Record<string, unknown>) => boolean;
  onFailure: (value: unknown, context?: Record<string, unknown>) => ValidationFailure;
}

/**
 * Execution context for rule evaluation
 */
export interface ExecutionContext {
  scope: ConfigScope;
  timestamp: number;
  ruleChain: string[]; // IDs of rules executed
  failures: ValidationFailure[];
  metadata?: Record<string, unknown>;
}

/**
 * Validation rule result
 */
export interface RuleExecutionResult {
  ruleId: string;
  passed: boolean;
  duration: number; // milliseconds
  failure?: ValidationFailure;
}

/**
 * Registry for storing and managing validation rules
 */
export class ValidationRuleRegistry {
  private rules: Map<string, ValidationRule> = new Map();
  private scopeIndex: Map<ConfigScope, string[]> = new Map();

  /**
   * Register a validation rule
   */
  register(rule: ValidationRule): void {
    if (this.rules.has(rule.id)) {
      throw new Error(`Rule with id '${rule.id}' already registered`);
    }

    this.rules.set(rule.id, rule);

    // Index by scope
    if (!this.scopeIndex.has(rule.scope)) {
      this.scopeIndex.set(rule.scope, []);
    }
    const scopeRules = this.scopeIndex.get(rule.scope)!;
    scopeRules.push(rule.id);

    // Sort by priority (descending)
    scopeRules.sort((a, b) => {
      const ruleA = this.rules.get(a)!;
      const ruleB = this.rules.get(b)!;
      return ruleB.priority - ruleA.priority;
    });
  }

  /**
   * Get a rule by ID
   */
  getRule(id: string): ValidationRule | undefined {
    return this.rules.get(id);
  }

  /**
   * Get all rules for a scope, ordered by priority
   */
  getRulesForScope(scope: ConfigScope): ValidationRule[] {
    const ids = this.scopeIndex.get(scope) || [];
    return ids.map((id) => this.rules.get(id)!).filter(Boolean);
  }

  /**
   * Get all registered rules
   */
  getAllRules(): ValidationRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Unregister a rule
   */
  unregister(id: string): boolean {
    const rule = this.rules.get(id);
    if (!rule) return false;

    this.rules.delete(id);

    const scopeRules = this.scopeIndex.get(rule.scope);
    if (scopeRules) {
      const idx = scopeRules.indexOf(id);
      if (idx >= 0) {
        scopeRules.splice(idx, 1);
      }
    }

    return true;
  }

  /**
   * Clear all rules
   */
  clear(): void {
    this.rules.clear();
    this.scopeIndex.clear();
  }

  /**
   * Get rule count
   */
  count(): number {
    return this.rules.size;
  }
}

/**
 * Validation runtime - executes rules and tracks results
 */
export class ValidationRuntime {
  private registry: ValidationRuleRegistry;
  private executionHistory: RuleExecutionResult[] = [];
  private maxHistorySize: number = 1000;

  constructor(registry?: ValidationRuleRegistry) {
    this.registry = registry || new ValidationRuleRegistry();
  }

  /**
   * Apply all rules for a scope to a value
   */
  async applyRules<T>(
    value: T,
    scope: ConfigScope,
    context?: Record<string, unknown>
  ): Promise<ValidationResult<T>> {
    const executionContext: ExecutionContext = {
      scope,
      timestamp: Date.now(),
      ruleChain: [],
      failures: [],
      metadata: context,
    };

    const rules = this.registry.getRulesForScope(scope);

    for (const rule of rules) {
      const startTime = performance.now();

      try {
        const passed = rule.predicate(value, context);

        if (!passed) {
          const failure = rule.onFailure(value, context);
          executionContext.failures.push(failure);
        }

        const duration = performance.now() - startTime;
        const result: RuleExecutionResult = {
          ruleId: rule.id,
          passed,
          duration,
          ...(passed ? {} : { failure: executionContext.failures[executionContext.failures.length - 1] }),
        };

        this.executionHistory.push(result);
        executionContext.ruleChain.push(rule.id);
      } catch (error) {
        // Rule execution failed - treat as validation failure
        const failure: ValidationFailure = {
          type: FailureType.ExecutionFailed,
          severity: FailureSeverity.Error,
          message: `Rule '${rule.id}' threw an error`,
          originalError: error instanceof Error ? error : undefined,
          originalErrorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        };

        executionContext.failures.push(failure);
        executionContext.ruleChain.push(rule.id);
      }

      // Trim history if too large
      if (this.executionHistory.length > this.maxHistorySize) {
        this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
      }
    }

    if (executionContext.failures.length > 0) {
      return validationError<T>(...executionContext.failures);
    }

    return validationSuccess<T>(value);
  }

  /**
   * Apply a single rule
   */
  async applyRule(
    value: unknown,
    ruleId: string,
    context?: Record<string, unknown>
  ): Promise<RuleExecutionResult> {
    const rule = this.registry.getRule(ruleId);
    if (!rule) {
      throw new Error(`Rule '${ruleId}' not found`);
    }

    const startTime = performance.now();

    try {
      const passed = rule.predicate(value, context);
      const duration = performance.now() - startTime;

      if (!passed) {
        const failure = rule.onFailure(value, context);
        const result: RuleExecutionResult = {
          ruleId,
          passed: false,
          duration,
          failure,
        };

        this.executionHistory.push(result);
        return result;
      }

      const result: RuleExecutionResult = {
        ruleId,
        passed: true,
        duration,
      };

      this.executionHistory.push(result);
      return result;
    } catch (error) {
      const duration = performance.now() - startTime;
      const result: RuleExecutionResult = {
        ruleId,
        passed: false,
        duration,
        failure: {
          type: FailureType.ExecutionFailed,
          severity: FailureSeverity.Error,
          message: `Rule execution failed: ${error instanceof Error ? error.message : String(error)}`,
          originalErrorMessage: error instanceof Error ? error.message : String(error),
          timestamp: Date.now(),
        },
      };

      this.executionHistory.push(result);
      return result;
    }
  }

  /**
   * Get execution history
   */
  getHistory(limit?: number): RuleExecutionResult[] {
    const history = [...this.executionHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Get execution statistics
   */
  getStats(): {
    totalExecutions: number;
    totalPassed: number;
    totalFailed: number;
    averageDuration: number;
    failureRate: number;
  } {
    if (this.executionHistory.length === 0) {
      return {
        totalExecutions: 0,
        totalPassed: 0,
        totalFailed: 0,
        averageDuration: 0,
        failureRate: 0,
      };
    }

    const totalExecutions = this.executionHistory.length;
    const totalPassed = this.executionHistory.filter((r) => r.passed).length;
    const totalFailed = totalExecutions - totalPassed;
    const averageDuration = this.executionHistory.reduce((sum, r) => sum + r.duration, 0) / totalExecutions;
    const failureRate = totalFailed / totalExecutions;

    return {
      totalExecutions,
      totalPassed,
      totalFailed,
      averageDuration,
      failureRate,
    };
  }

  /**
   * Clear execution history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get the registry
   */
  getRegistry(): ValidationRuleRegistry {
    return this.registry;
  }

  /**
   * Set a new registry
   */
  setRegistry(registry: ValidationRuleRegistry): void {
    this.registry = registry;
  }
}

/**
 * Builder for creating validation rules fluently
 */
export class RuleBuilder {
  private rule: Partial<ValidationRule> = { priority: 50 };

  withId(id: string): this {
    this.rule.id = id;
    return this;
  }

  withName(name: string): this {
    this.rule.name = name;
    return this;
  }

  withScope(scope: ConfigScope): this {
    this.rule.scope = scope;
    return this;
  }

  withPriority(priority: number): this {
    this.rule.priority = Math.max(0, Math.min(100, priority));
    return this;
  }

  withPredicate(predicate: (value: unknown, context?: Record<string, unknown>) => boolean): this {
    this.rule.predicate = predicate;
    return this;
  }

  withFailureHandler(handler: (value: unknown, context?: Record<string, unknown>) => ValidationFailure): this {
    this.rule.onFailure = handler;
    return this;
  }

  build(): ValidationRule {
    if (!this.rule.id) throw new Error('Rule must have an id');
    if (!this.rule.name) throw new Error('Rule must have a name');
    if (!this.rule.scope) throw new Error('Rule must have a scope');
    if (!this.rule.predicate) throw new Error('Rule must have a predicate');
    if (!this.rule.onFailure) throw new Error('Rule must have a onFailure handler');

    return this.rule as ValidationRule;
  }
}
