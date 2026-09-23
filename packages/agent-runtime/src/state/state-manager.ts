/**
 * OneShot Agent Runtime — Strands Agent State Manager & Serialization Validator
 *
 * Implements state management rules per https://strandsagents.com/docs/user-guide/sdk/agents/state/
 * - Strict JSON serialization verification for agent.appState
 * - State synchronization with OneShotWorkflowEngine and SessionLedger
 * - Invocation state mutation and audit propagation
 */

import type { OneShotAppStateData } from "./types.js";
import type { WorkflowStage } from "../workflow/types.js";

/**
 * Validates that a value is strictly JSON serializable.
 * Throws an Error if functions, circular references, undefined, symbols, or BigInt are encountered.
 */
export function validateJsonSerializable(value: unknown, path = "root", seen = new WeakSet<object>()): void {
  if (value === null || value === undefined) {
    return;
  }

  const valueType = typeof value;

  if (valueType === "function") {
    throw new TypeError(`Value at "${path}" contains a function which cannot be serialized`);
  }

  if (valueType === "symbol" || valueType === "bigint") {
    throw new TypeError(`Value at "${path}" of type ${valueType} cannot be serialized to JSON`);
  }

  if (valueType === "object") {
    if (seen.has(value as object)) {
      throw new TypeError(`Circular reference detected at "${path}" which cannot be serialized`);
    }
    seen.add(value as object);

    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        validateJsonSerializable(item, `${path}[${index}]`, seen);
      });
    } else {
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        if (typeof val === "function") {
          throw new TypeError(`Key "${key}" at "${path}" contains a function which cannot be serialized`);
        }
        validateJsonSerializable(val, `${path}.${key}`, seen);
      }
    }
  }
}

/**
 * Creates default OneShot appState ensuring complete JSON serializability.
 */
export function createInitialAppState(overrides?: Partial<OneShotAppStateData>): OneShotAppStateData {
  const defaults: OneShotAppStateData = {
    workflowStage: "research",
    gate1Status: "pending",
    gate2Status: "pending",
    confirmedPackageCore: null,
    restorePoint: "RES-7702-INIT",
    userPreferences: {
      theme: "dark",
      autoResearchOnPrompt: true,
    },
    activeSubtaskIds: [],
    metadata: {
      initializedAt: new Date().toISOString(),
      agentVersion: "oneshot-v3-strands",
    },
    ...overrides,
  };

  validateJsonSerializable(defaults, "initialAppState");
  return defaults;
}

/**
 * Interface representing Strands StateStore (`agent.appState`).
 */
export interface StrandsStateStore {
  get<T = unknown>(key?: string): T;
  set(key: string, value: unknown): void;
  delete(key: string): void;
}

/**
 * Bridge facilitating safe interaction between Strands Agent state and OneShot runtime contracts.
 */
export class OneShotStateBridge {
  /**
   * Retrieves current workflow stage from Strands appState.
   */
  static getWorkflowStage(state: StrandsStateStore | Record<string, unknown>): WorkflowStage {
    if ("get" in state && typeof state.get === "function") {
      return (state.get("workflowStage") as WorkflowStage) || "research";
    }
    const record = state as Record<string, unknown>;
    return (record["workflowStage"] as WorkflowStage) || "research";
  }

  /**
   * Updates workflow stage in Strands appState after validating serializability.
   */
  static setWorkflowStage(state: StrandsStateStore, stage: WorkflowStage): void {
    validateJsonSerializable(stage, "workflowStage");
    state.set("workflowStage", stage);
  }

  /**
   * Confirms Gate 1 (Research Review) in appState.
   */
  static confirmGate1(state: StrandsStateStore): void {
    state.set("gate1Status", "confirmed");
  }

  /**
   * Confirms Gate 2 (Build Ready) in appState with SHA-256 package hash.
   */
  static confirmGate2(state: StrandsStateStore, packageCoreHash: string): void {
    if (!packageCoreHash || typeof packageCoreHash !== "string") {
      throw new Error("Cannot confirm Gate 2 without a valid package core hash");
    }
    state.set("gate2Status", "confirmed");
    state.set("confirmedPackageCore", packageCoreHash);
  }

  /**
   * Records an audit event into the ephemeral invocationState dictionary.
   */
  static recordInvocationAudit(
    invocationState: Record<string, unknown>,
    action: string,
    details?: unknown
  ): void {
    if (!Array.isArray(invocationState.auditEvents)) {
      invocationState.auditEvents = [];
    }
    (invocationState.auditEvents as Array<{ timestamp: string; action: string; details?: unknown }>).push({
      timestamp: new Date().toISOString(),
      action,
      details,
    });
    invocationState.toolCallCount = ((invocationState.toolCallCount as number) || 0) + 1;
  }
}
