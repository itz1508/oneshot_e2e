/**
 * OneShot Workflow Hooks
 *
 * Pre/post execution hooks, state transition handlers, and event listeners
 * for workflow execution lifecycle.
 *
 * Pattern: Extracted from Pydantic architecture workflow lifecycle hooks
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../validation/failure-taxonomy.js';

/**
 * Workflow hook types
 */
export enum HookType {
  PreExecution = 'pre-execution',
  PostExecution = 'post-execution',
  PreTransition = 'pre-transition',
  PostTransition = 'post-transition',
  OnError = 'on-error',
  OnSuccess = 'on-success',
}

/**
 * Hook context
 */
export interface HookContext {
  nodeId: string;
  workflowId: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
  previousResult?: unknown;
  error?: Error;
}

/**
 * Hook definition
 */
export interface WorkflowHook {
  id: string;
  type: HookType;
  handler: (context: HookContext) => Promise<void | ValidationFailure>;
  enabled: boolean;
  async: boolean;
}

/**
 * Hook execution result
 */
export interface HookExecutionResult {
  hookId: string;
  type: HookType;
  executed: boolean;
  duration: number;
  error?: ValidationFailure;
}

/**
 * Recognized authorized event producers for lifecycle ownership enforcement
 */
export const AUTHORIZED_EVENT_PRODUCERS = new Set([
  'Researcher',
  'Planner',
  'Builder',
  'Evaluator',
  'Refactor',
  'GapAnalysis',
  'System',
  'User',
]);

/**
 * Hook lifecycle event
 */
export interface HookLifecycleEvent {
  type: 'registered' | 'unregistered' | 'executed' | 'failed';
  hook: WorkflowHook;
  result?: HookExecutionResult;
  producerId?: string;
  publishAs?: string;
}

/**
 * Hook event listener
 */
export type HookEventListener = (event: HookLifecycleEvent) => void | Promise<void>;

/**
 * Workflow hooks registry
 */
export class WorkflowHooksRegistry {
  private hooks: Map<string, WorkflowHook> = new Map();
  private typeIndex: Map<HookType, string[]> = new Map();
  private listeners: HookEventListener[] = [];

  /**
   * Register a hook
   */
  register(hook: WorkflowHook): void {
    if (this.hooks.has(hook.id)) {
      throw new Error(`Hook '${hook.id}' already registered`);
    }

    this.hooks.set(hook.id, hook);

    // Index by type
    if (!this.typeIndex.has(hook.type)) {
      this.typeIndex.set(hook.type, []);
    }
    this.typeIndex.get(hook.type)!.push(hook.id);

    this.emit({ type: 'registered', hook });
  }

  /**
   * Unregister a hook
   */
  unregister(id: string): boolean {
    const hook = this.hooks.get(id);
    if (!hook) return false;

    this.hooks.delete(id);

    const typeHooks = this.typeIndex.get(hook.type);
    if (typeHooks) {
      const idx = typeHooks.indexOf(id);
      if (idx >= 0) typeHooks.splice(idx, 1);
    }

    this.emit({ type: 'unregistered', hook });

    return true;
  }

  /**
   * Get hook by ID
   */
  getHook(id: string): WorkflowHook | undefined {
    return this.hooks.get(id);
  }

  /**
   * Get hooks by type
   */
  getHooksByType(type: HookType): WorkflowHook[] {
    const ids = this.typeIndex.get(type) || [];
    return ids.map((id) => this.hooks.get(id)!).filter((h) => h.enabled);
  }

  /**
   * Enable/disable hook
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const hook = this.hooks.get(id);
    if (!hook) return false;

    hook.enabled = enabled;
    return true;
  }

  /**
   * Subscribe to hook events
   */
  on(listener: HookEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Unsubscribe from hook events
   */
  off(listener: HookEventListener): boolean {
    const idx = this.listeners.indexOf(listener);
    if (idx >= 0) {
      this.listeners.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * Emit event with producer identity enforcement
   */
  emit(event: HookLifecycleEvent, publishAs: string = 'System'): void {
    if (publishAs && !AUTHORIZED_EVENT_PRODUCERS.has(publishAs)) {
      throw new Error(`Unauthorized event emission: '${publishAs}' is not a recognized authorized event producer.`);
    }
    event.producerId = publishAs;
    event.publishAs = publishAs;
    for (const listener of this.listeners) {
      Promise.resolve(listener(event)).catch((error) => {
        console.error('Hook listener error:', error);
      });
    }
  }

  /**
   * Get all hooks
   */
  getAllHooks(): WorkflowHook[] {
    return Array.from(this.hooks.values());
  }

  /**
   * Clear all hooks
   */
  clear(): void {
    this.hooks.clear();
    this.typeIndex.clear();
  }

  /**
   * Get hook count
   */
  count(): number {
    return this.hooks.size;
  }
}

/**
 * Hook executor
 */
export class HookExecutor {
  private registry: WorkflowHooksRegistry;
  private executionHistory: HookExecutionResult[] = [];
  private maxHistorySize: number = 1000;

  constructor(registry?: WorkflowHooksRegistry) {
    this.registry = registry || new WorkflowHooksRegistry();
  }

  /**
   * Execute hooks of a specific type
   */
  async executeHooks(type: HookType, context: HookContext): Promise<ValidationResult<HookExecutionResult[]>> {
    const hooks = this.registry.getHooksByType(type);
    const results: HookExecutionResult[] = [];
    const failures: ValidationFailure[] = [];

    for (const hook of hooks) {
      const result = await this.executeHook(hook, context);
      results.push(result);

      if (result.error) {
        failures.push(result.error);
      }

      if (this.executionHistory.length > this.maxHistorySize) {
        this.executionHistory = this.executionHistory.slice(-this.maxHistorySize);
      }
    }

    if (failures.length > 0) {
      return validationError(...failures);
    }

    return validationSuccess(results);
  }

  /**
   * Execute a single hook
   */
  async executeHook(hook: WorkflowHook, context: HookContext): Promise<HookExecutionResult> {
    const startTime = performance.now();

    try {
      const result = await hook.handler(context);

      const duration = performance.now() - startTime;
      const executionResult: HookExecutionResult = {
        hookId: hook.id,
        type: hook.type,
        executed: true,
        duration,
        ...(result ? { error: result } : {}),
      };

      this.executionHistory.push(executionResult);
      return executionResult;
    } catch (error) {
      const duration = performance.now() - startTime;
      const failure: ValidationFailure = {
        type: FailureType.ExecutionFailed,
        severity: FailureSeverity.Error,
        message: `Hook '${hook.id}' execution failed`,
        originalErrorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };

      const result: HookExecutionResult = {
        hookId: hook.id,
        type: hook.type,
        executed: false,
        duration,
        error: failure,
      };

      this.executionHistory.push(result);
      return result;
    }
  }

  /**
   * Get execution history
   */
  getHistory(limit?: number): HookExecutionResult[] {
    const history = [...this.executionHistory];
    if (limit) {
      return history.slice(-limit);
    }
    return history;
  }

  /**
   * Clear history
   */
  clearHistory(): void {
    this.executionHistory = [];
  }

  /**
   * Get registry
   */
  getRegistry(): WorkflowHooksRegistry {
    return this.registry;
  }

  /**
   * Set registry
   */
  setRegistry(registry: WorkflowHooksRegistry): void {
    this.registry = registry;
  }
}

/**
 * Fluent hook builder
 */
export class HookBuilder {
  private hook: Partial<WorkflowHook> = { enabled: true, async: true };

  withId(id: string): this {
    this.hook.id = id;
    return this;
  }

  withType(type: HookType): this {
    this.hook.type = type;
    return this;
  }

  withHandler(handler: (context: HookContext) => Promise<void | ValidationFailure>): this {
    this.hook.handler = handler;
    return this;
  }

  withAsync(async: boolean): this {
    this.hook.async = async;
    return this;
  }

  withEnabled(enabled: boolean): this {
    this.hook.enabled = enabled;
    return this;
  }

  build(): WorkflowHook {
    if (!this.hook.id) throw new Error('Hook must have an id');
    if (!this.hook.type) throw new Error('Hook must have a type');
    if (!this.hook.handler) throw new Error('Hook must have a handler');

    return this.hook as WorkflowHook;
  }
}
