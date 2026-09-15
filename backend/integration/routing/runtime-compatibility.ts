import type {
  CapabilityEvidence,
  ModelCapability,
} from "../core/capability.js";
import { isCapabilityUsable } from "../core/capability.js";
import type { ModelTransport } from "../core/types.js";
import type { RuntimeDefinition } from "../runtime/registry.js";

/**
 * Runtime compatibility resolver (M6). Decides whether a runtime can drive a
 * model from (a) transport — the runtime must support the model's transport,
 * and (b) capability evidence — every workflow-required capability must be
 * USABLE (declared or verified). Unknown/failed/unsupported evidence is NOT
 * usable. The resolver is pure: it consumes evidence + transport, no network.
 */
export interface CompatibilityInput {
  readonly runtime: RuntimeDefinition;
  readonly transport: ModelTransport;
  readonly capabilities: readonly CapabilityEvidence[];
  readonly required: readonly ModelCapability[];
}

export interface CompatibilityResult {
  readonly compatible: boolean;
  readonly reasons: readonly string[];
}

export interface RuntimeCompatibilityResolver {
  resolve(input: CompatibilityInput): CompatibilityResult;
}

export function createRuntimeCompatibilityResolver(): RuntimeCompatibilityResolver {
  return {
    resolve: (input) => {
      const reasons: string[] = [];
      // 1. Transport: the runtime must drive the model's transport.
      if (!input.runtime.supportedTransports.includes(input.transport)) {
        reasons.push(
          `runtime '${input.runtime.runtimeId}' does not support transport '${input.transport}'`,
        );
      }
      // 2. Each required capability must have usable evidence.
      for (const cap of input.required) {
        const evidence = input.capabilities.find((e) => e.capability === cap);
        if (!evidence) {
          reasons.push(`missing capability evidence for '${cap}'`);
        } else if (!isCapabilityUsable(evidence)) {
          reasons.push(
            `capability '${cap}' is '${evidence.state}' (need verified/declared)`,
          );
        }
      }
      return { compatible: reasons.length === 0, reasons };
    },
  };
}
