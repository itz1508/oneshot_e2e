import test from "node:test";
import assert from "node:assert/strict";
import {
  isCloudLocality,
  isLocalLocality,
  type EndpointDefinition,
  type EndpointHealth,
  type ModelCandidate,
  type ProviderDefinition,
} from "../../integration/core/types.js";
import { unknownCapability } from "../../integration/core/capability.js";
import { DEFAULT_ROUTING_POLICY } from "../../integration/core/policy.js";
import {
  usableCapabilities,
  type ResolvedExecutionRoute,
} from "../../integration/core/route.js";

test("isLocalLocality: loopback, container-host, private-network are local; cloud and unknown are not", () => {
  assert.equal(isLocalLocality("loopback"), true);
  assert.equal(isLocalLocality("container-host"), true);
  assert.equal(isLocalLocality("private-network"), true);
  assert.equal(isLocalLocality("cloud"), false);
  assert.equal(isLocalLocality("unknown"), false);
});

test("isCloudLocality: only cloud is cloud", () => {
  assert.equal(isCloudLocality("cloud"), true);
  assert.equal(isCloudLocality("loopback"), false);
  assert.equal(isCloudLocality("private-network"), false);
  assert.equal(isCloudLocality("unknown"), false);
});

test("EndpointDefinition is persisted separately from EndpointHealth", () => {
  const def: EndpointDefinition = {
    endpointId: "ep-ollama-1",
    providerId: "ollama",
    baseUrl: "http://localhost:11434",
    authMethod: "none",
    locality: "loopback",
    origin: "preset",
    allowedHeaders: [],
  };
  const health: EndpointHealth = {
    endpointId: "ep-ollama-1",
    reachable: true,
    latencyMs: 12,
    dnsResolved: true,
  };
  // Definition must not carry mutable probe fields.
  assert.equal(Object.hasOwn(def, "reachable"), false);
  assert.equal(Object.hasOwn(def, "latencyMs"), false);
  assert.equal(Object.hasOwn(def, "probeError"), false);
  // Health must not carry configuration fields.
  assert.equal(Object.hasOwn(health, "baseUrl"), false);
  assert.equal(Object.hasOwn(health, "locality"), false);
  assert.equal(Object.hasOwn(health, "authMethod"), false);
  // They share only the endpointId.
  assert.equal(def.endpointId, health.endpointId);
});

test("ModelCandidate identity is provider-scoped: same modelId across providers does not collide", () => {
  const local: ModelCandidate = {
    modelId: "llama3.1",
    providerId: "ollama",
    endpointId: "ep-ollama-1",
    displayName: "Llama 3.1",
    discovered: true,
  };
  const cloud: ModelCandidate = {
    modelId: "llama3.1",
    providerId: "groq",
    endpointId: "ep-groq-1",
    displayName: "Llama 3.1 70B",
    discovered: true,
  };
  assert.equal(local.modelId, cloud.modelId);
  assert.notEqual(local.providerId, cloud.providerId);
  assert.notEqual(local.endpointId, cloud.endpointId);
});

test("ProviderDefinition carries no credentials", () => {
  const provider: ProviderDefinition = {
    providerId: "ollama",
    displayName: "Ollama",
    kind: "preset",
    transport: "openai-chat",
    authMethod: "none",
    requiresAuth: false,
    allowedHeaders: [],
  };
  assert.equal(Object.hasOwn(provider, "apiKey"), false);
  assert.equal(Object.hasOwn(provider, "apiKeyEnv"), false);
  assert.equal(provider.requiresAuth, false);
});

test("ResolvedExecutionRoute is non-secret and usableCapabilities filters by state", () => {
  const route: ResolvedExecutionRoute = {
    routeId: "route-1",
    workflowId: "researcher",
    policy: DEFAULT_ROUTING_POLICY,
    runtimeId: "strands",
    providerId: "ollama",
    endpointId: "ep-ollama-1",
    baseUrl: "http://localhost:11434",
    modelId: "llama3.1",
    transport: "openai-chat",
    locality: "loopback",
    capabilities: [
      { capability: "tool-use", state: "verified", source: "probe" },
      unknownCapability("structured-output"),
      {
        capability: "streaming",
        state: "failed",
        source: "probe",
        failureReason: "endpoint does not stream",
      },
    ],
    researchMode: "local-only",
    routeReason: "prefer-local selected the only loopback candidate",
    rejectedCandidates: [],
    createdAt: "2026-09-14T00:00:00.000Z",
    expiresAt: "2026-09-14T01:00:00.000Z",
  };
  assert.equal(Object.hasOwn(route, "apiKey"), false);
  assert.equal(Object.hasOwn(route, "credential"), false);
  assert.deepEqual(usableCapabilities(route), ["tool-use"]);
});
