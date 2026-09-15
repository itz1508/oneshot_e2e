import { createProviderRegistry } from "../../integration/provider/registry.js";
import { createEndpointRegistry } from "../../integration/endpoint/registry.js";
import { createModelRegistry } from "../../integration/model/registry.js";
import { createCapabilityRegistry } from "../../integration/capability/registry.js";
import { createRuntimeRegistry } from "../../integration/runtime/registry.js";
import { createRuntimeCompatibilityResolver } from "../../integration/routing/runtime-compatibility.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import type {
  CapabilityEvidence,
  ModelCapability,
} from "../../integration/core/capability.js";
import type { ResearchMode, RoutingPolicy } from "../../integration/core/policy.js";
import type {
  EndpointDefinition,
  EndpointLocality,
  ModelCandidate,
  ProviderDefinition,
} from "../../integration/core/types.js";
import type { ModelTransport } from "../../integration/core/types.js";
import type { RuntimeDefinition } from "../../integration/runtime/registry.js";
import type { RouteRequest, RouterDeps } from "../../integration/routing/router.js";

export function verifiedEv(cap: ModelCapability): CapabilityEvidence {
  return { capability: cap, state: "verified", source: "probe" };
}
export function declaredEv(cap: ModelCapability): CapabilityEvidence {
  return { capability: cap, state: "declared", source: "provider-preset" };
}
export function failedEv(cap: ModelCapability): CapabilityEvidence {
  return { capability: cap, state: "failed", source: "probe" };
}

export function ep(
  providerId: string,
  endpointId: string,
  locality: EndpointLocality,
  baseUrl = "http://ep.invalid",
): EndpointDefinition {
  return {
    endpointId,
    providerId,
    baseUrl,
    authMethod: "none",
    locality,
    origin: "preset",
    allowedHeaders: [],
  };
}

export function mdl(
  providerId: string,
  endpointId: string,
  modelId: string,
): ModelCandidate {
  return { modelId, providerId, endpointId, displayName: modelId, discovered: true };
}

export interface DepsInput {
  readonly providers?: readonly ProviderDefinition[];
  readonly endpoints?: readonly EndpointDefinition[];
  readonly models?: readonly ModelCandidate[];
  readonly evidence?: ReadonlyArray<{
    endpointId: string;
    modelId: string;
    ev: CapabilityEvidence;
  }>;
  readonly runtimes?: readonly RuntimeDefinition[];
  readonly health?: ReadonlyArray<{
    endpointId: string;
    reachable: boolean;
    probeError?: string;
  }>;
}

export function makeDeps(input: DepsInput = {}): RouterDeps {
  const providers = createProviderRegistry(input.providers ?? []);
  const endpoints = createEndpointRegistry();
  const models = createModelRegistry();
  const capabilities = createCapabilityRegistry();
  const runtimes = createRuntimeRegistry();
  for (const e of input.endpoints ?? []) endpoints.add(e);
  for (const h of input.health ?? [])
    endpoints.setHealth(h.endpointId, {
      endpointId: h.endpointId,
      reachable: h.reachable,
      probeError: h.probeError,
    });
  for (const m of input.models ?? []) models.add(m);
  for (const { endpointId, modelId, ev } of input.evidence ?? [])
    capabilities.record(endpointId, modelId, ev);
  for (const r of input.runtimes ?? []) runtimes.add(r);
  return {
    providers,
    endpoints,
    models,
    capabilities,
    runtimes,
    compatibility: createRuntimeCompatibilityResolver(),
  };
}

export function makeRequest(over: Partial<RouteRequest> = {}): RouteRequest {
  return {
    workflowId: "researcher",
    runId: "run-1",
    policy: DEFAULT_ROUTING_POLICY,
    required: ["tool-use", "structured-output"],
    preferredTransports: ["openai-chat"],
    researchMode: "disabled",
    ...over,
  };
}

export function rt(
  id: string,
  transports: readonly ModelTransport[],
): RuntimeDefinition {
  return { runtimeId: id, displayName: id, supportedTransports: transports };
}
