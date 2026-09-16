/**
 * HTTP handlers for the Researcher vertical slice (M13).
 *
 * Exposes the neutral Researcher workflow through the existing server.
 * Request resolution chain:
 *   Request → workflow requirements → routing policy → execution route
 *   → credential reference → runtime → research policy → Researcher workflow
 *   → canonical validation → wait-human
 *
 * Credentials are never accepted from HTTP input (M11). Provider test/discover
 * endpoints resolve credentials only from server-side approved env vars.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { json, body } from "./http-response.js";
import { id, newRunId } from "../core/id.js";
import type { Prompt } from "../contracts/schema/types.js";
import type { RunRepository } from "../runtime/run-repository.js";
import type { ArtifactStore } from "../runtime/artifact-store.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type { ResearcherWorkflow } from "../agents/researcher/workflow.js";
import {
  researcherExecutionRequirements,
  type ExecutionRequirements,
} from "../agents/researcher/execution-requirements.js";
import type { Router, RouteRequest, RouteResult } from "../integration/routing/router.js";
import type { AgentRuntime, RuntimeInvocation } from "../integration/runtime/types.js";
import type { ResolvedExecutionRoute } from "../integration/core/route.js";
import type { RoutingPolicy, ResearchMode } from "../integration/core/policy.js";
import {
  decideResearchPolicy,
  resolveRequestedResearchMode,
  type ResearchPolicyDecision,
} from "../integration/research/policy.js";
import type { CredentialReference } from "../security/credential-reference.js";
import type { CredentialResolver } from "../security/credential-resolver.js";
import type { CredentialPolicy } from "../security/credential-policy.js";
import type { ModelCapability } from "../integration/core/capability.js";
import {
  probeLiveModels,
  resolveProviderConfiguration,
  KNOWN_PROVIDERS,
} from "../integration/provider-discovery.js";
import { autoDetectOllamaBaseUrl } from "../integration/provider/ollama-discovery.js";
export { body } from "./http-response.js";

/** Non-secret subset of a route, safe to place on RunSnapshot and response bodies. */
export interface RouteSnapshot {
  routeId: string;
  workflowId: string;
  runtimeId: string;
  providerId: string;
  endpointId: string;
  baseUrl: string;
  modelId: string;
  transport: string;
  locality: string;
  researchMode: ResearchMode;
  routeReason: string;
  considered: number;
  rejectedCount: number;
}

function toRouteSnapshot(
  route: ResolvedExecutionRoute,
  result: RouteResult,
): RouteSnapshot {
  return {
    routeId: route.routeId,
    workflowId: route.workflowId,
    runtimeId: route.runtimeId,
    providerId: route.providerId,
    endpointId: route.endpointId,
    baseUrl: route.baseUrl,
    modelId: route.modelId,
    transport: route.transport,
    locality: route.locality,
    researchMode: route.researchMode,
    routeReason: route.routeReason,
    considered: result.considered,
    rejectedCount: result.rejected.length,
    };
}

export interface ResearcherHandlerContext {
  runs: RunRepository;
  store: ArtifactStore;
  events: ProcessingEventBus;
  researcher: ResearcherWorkflow;
  router: Router;
  routingPolicy: RoutingPolicy;
  runtimeResolver: (runtimeId: string) => AgentRuntime | undefined;
  credentialResolver?: CredentialResolver;
  credentialPolicy?: CredentialPolicy;
}

interface ResearcherRunInput {
  intent: string;
  requested_outcome: string;
  context: Array<{ context_id: string; statement: string }>;
  research_direction: string[];
  /** Non-secret credential reference; secrets never travel in HTTP input. */
  credentialRef?: CredentialReference;
  routingMode?: "manual" | "automatic";
  researchMode?: ResearchMode;
}

function validateRunInput(input: Record<string, unknown>): ResearcherRunInput {
  const intent = input.intent;
  const requestedOutcome = input.requested_outcome;
  if (typeof intent !== "string" || intent.trim() === "") {
    throw new Error("intent is required and must be a non-empty string");
  }
  if (typeof requestedOutcome !== "string" || requestedOutcome.trim() === "") {
    throw new Error(
      "requested_outcome is required and must be a non-empty string",
    );
  }
  const direction = input.research_direction;
  const context = input.context;
  const credentialRef = input.credentialRef as
    | CredentialReference
    | undefined;
  if (credentialRef !== undefined) {
    if (
      typeof credentialRef.credentialId !== "string" ||
      typeof credentialRef.providerId !== "string" ||
      !["environment", "session", "secret-store", "none"].includes(
        credentialRef.source,
      )
    ) {
      throw new Error("invalid credentialRef");
    }
  }
  return {
    intent: intent.trim(),
    requested_outcome: requestedOutcome.trim(),
    context: Array.isArray(context)
      ? context.map((c) => ({
          context_id: String(c.context_id || ""),
          statement: String(c.statement || ""),
        }))
      : [],
    research_direction: Array.isArray(direction) ? direction.map(String) : ["contracts", "proof"],
    credentialRef,
    routingMode: input.routingMode as "manual" | "automatic" | undefined,
    researchMode: input.researchMode as ResearchMode | undefined,
  };
}

function buildPrompt(runId: string, input: ResearcherRunInput): Prompt {
  return {
    prompt_id: id("prompt", runId),
    intent: input.intent,
    requested_outcome: input.requested_outcome,
    context: input.context.length
      ? input.context
      : [
          {
            context_id: id("ctx", runId),
            statement: "OneShot researcher HTTP vertical slice",
          },
        ],
    research_direction: input.research_direction,
  };
}

// --- Endpoint: GET /api/providers ---

function normalizeProviderError(error: unknown): {
  status: number;
  message: string;
} {
  if (
    error instanceof Error &&
    /credential|api.?key|token|secret/i.test(error.message)
  ) {
    return { status: 503, message: "provider credential unavailable" };
  }
  if (error instanceof Error && /HEADER_NOT_ALLOWED/i.test(error.message)) {
    return { status: 400, message: error.message };
  }
  return {
    status: 502,
    message:
      error instanceof Error ? error.message : "provider invocation failed",
  };
}

export async function handleListProviders(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  _input: Record<string, unknown>,
  _ctx: ResearcherHandlerContext,
): Promise<boolean> {
  const detectedOllama = await autoDetectOllamaBaseUrl().catch(() => undefined);
  const providers = Object.values(KNOWN_PROVIDERS).map((p) => {
    if (p.id === "ollama" && detectedOllama) {
      return {
        id: p.id,
        name: p.name,
        requiresApiKey: p.requiresApiKey,
        endpointCandidates: [
          {
            id: "ollama-detected",
            url: detectedOllama,
            label: `Detected Ollama (${detectedOllama})`,
            source: "discovered" as const,
          },
          ...p.endpointCandidates,
        ],
        discoveredEndpoint: detectedOllama,
      };
    }
    return {
      id: p.id,
      name: p.name,
      requiresApiKey: p.requiresApiKey,
      endpointCandidates: p.endpointCandidates,
    };
  });
  json(res, 200, { providers });
  return true;
}

// --- Endpoint: POST /api/providers ---

export async function handleCreateProvider(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  input: Record<string, unknown>,
  ctx: ResearcherHandlerContext,
): Promise<boolean> {
  const providerId =
    typeof input.provider_id === "string" ? input.provider_id.trim() : "";
  const baseUrl = typeof input.baseUrl === "string" ? input.baseUrl.trim() : "";
  const apiKey =
    typeof input.api_key === "string" ? input.api_key.trim() : undefined;

  if (!providerId) {
    json(res, 400, {
      error: "provider_id is required and must be a non-empty string",
    });
    return true;
  }
  if (!baseUrl) {
    json(res, 400, {
      error: "baseUrl is required and must be a non-empty string",
    });
    return true;
  }

  // Validate URL protocol
  try {
    const parsed = new URL(baseUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      json(res, 400, { error: "baseUrl must use http or https protocol" });
      return true;
    }
  } catch {
    json(res, 400, { error: "invalid baseUrl format" });
    return true;
  }

  // M17: Enforce credential policy
  if (apiKey) {
    if (ctx.credentialPolicy?.isPublicUnauthed()) {
      json(res, 403, {
        error: "credential management is disabled in public unauthenticated mode",
      });
      return true;
    }
    try {
      ctx.credentialPolicy?.assertStorageAllowed("session");
    } catch (e: any) {
      json(res, 403, { error: e.message || "credential storage not allowed" });
      return true;
    }
  }

  // Register or update KNOWN_PROVIDERS
  KNOWN_PROVIDERS[providerId] = {
    id: providerId,
    name: (input.name as string) || providerId,
    requiresApiKey: Boolean(apiKey),
    endpointCandidates: [
      {
        id: `${providerId}-custom`,
        url: baseUrl,
        label: `${providerId} (${baseUrl})`,
        source: "custom",
      },
    ],
    knownCapabilities: {
      toolCalling: true,
      streaming: true,
      structuredOutput: true,
    },
  };

  json(res, 201, {
    provider_id: providerId,
    baseUrl,
    status: "created",
  });
  return true;
}

// --- Endpoint: POST /api/providers/test ---

export async function handleProviderTest(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  input: Record<string, unknown>,
  _ctx: ResearcherHandlerContext,
): Promise<boolean> {
  // Credentials resolved ONLY from server-side approved env vars.
  const provConfig = resolveProviderConfiguration();
  if (!provConfig.baseUrl) {
    json(res, 400, { error: "no provider configured on the server" });
    return true;
  }
  try {
    const models = await probeLiveModels(provConfig.baseUrl, provConfig.apiKey);
    json(res, 200, {
      provider: provConfig.provider,
      baseUrl: provConfig.baseUrl,
      apiKeyPresent: provConfig.apiKeyPresent,
      reachable: true,
      modelCount: models.length,
    });
    return true;
  } catch (e) {
    const { status, message } = normalizeProviderError(e);
    json(res, status, { error: message, provider: provConfig.provider });
    return true;
  }
}

// --- Endpoint: POST /api/providers/discover-models ---

export async function handleDiscoverModels(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  input: Record<string, unknown>,
  _ctx: ResearcherHandlerContext,
): Promise<boolean> {
  const provConfig = resolveProviderConfiguration();
  if (!provConfig.baseUrl) {
    json(res, 400, { error: "no provider configured on the server" });
    return true;
  }
  try {
    const models = await probeLiveModels(provConfig.baseUrl, provConfig.apiKey);
    json(res, 200, {
      provider: provConfig.provider,
      baseUrl: provConfig.baseUrl,
      models: models.map((m) => ({
        id: m.id,
        capabilities: m.capabilities,
      })),
    });
    return true;
  } catch (e) {
    const { status, message } = normalizeProviderError(e);
    json(res, status, { error: message, provider: provConfig.provider });
    return true;
  }
}

// --- Endpoint: POST /api/runs/:runId/review ---

export async function handleReview(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  input: Record<string, unknown>,
  ctx: ResearcherHandlerContext,
  runId: string,
): Promise<boolean> {
  const snap = ctx.runs.get(runId);
  if (!snap) {
    json(res, 404, { error: "run not found", run_id: runId });
    return true;
  }
  const decision = input.decision;
  if (decision !== "approved" && decision !== "rejected") {
    json(res, 400, { error: "decision must be 'approved' or 'rejected'", run_id: runId });
    return true;
  }
  await ctx.store.save(runId, "review-decision", {
    decision, feedback: typeof input.feedback === "string" ? input.feedback : "",
    decided_at: new Date().toISOString(),
  });
  ctx.runs.artifact(runId, "review-decision", "review-decision.json");
  if (decision === "approved") {
    snap.pipeline_status = "Done";
    snap.test_result = "Passed";
  } else {
    snap.pipeline_status = "Done";
    snap.test_result = "Failed";
    snap.issue_type = "Root Cause";
    snap.root_cause = {
      issue: "Research bundle rejected by human review",
      expected: "Research bundle approved by human review",
      actual: "Research bundle rejected",
      evidence_ids: [],
      required_correction: input.feedback ? String(input.feedback) : "Correct per reviewer feedback",
      recheck_target: "Researcher",
    };
  }
  ctx.events.emit(runId, "Review", decision === "approved" ? "Completed" : "Failed", {
    message: `Review ${decision}`,
    ...(decision === "approved" ? { test_result: "Passed" as const } : {}),
  });
  json(res, 200, {
    run_id: runId, status: decision, pipeline_status: snap.pipeline_status,
    test_result: snap.test_result, route_snapshot: snap.route_snapshot ?? null,
  });
  return true;
}


export async function handleResearcherRun(
  _req: IncomingMessage,
  res: ServerResponse,
  _url: URL,
  input: Record<string, unknown>,
  ctx: ResearcherHandlerContext,
): Promise<boolean> {
  const runId = newRunId();
  let parsed: ResearcherRunInput;
  try {
    parsed = validateRunInput(input);
  } catch (e) {
    json(res, 400, { error: e instanceof Error ? e.message : String(e), run_id: runId });
    return true;
  }
  const prompt = buildPrompt(runId, parsed);
  const requirements = researcherExecutionRequirements(parsed.researchMode ?? "disabled");
  const policy = ctx.routingPolicy;
  const researchMode = parsed.researchMode ?? policy.researchMode;
  const routeResult = ctx.router.route({
    workflowId: requirements.workflowId, runId, policy,
    required: requirements.requirements.requiredCapabilities,
    preferredTransports: requirements.requirements.preferredTransports,
    researchMode,
  });
  if (!routeResult.route) {
    json(res, 400, { error: "no eligible route", run_id: runId, considered: routeResult.considered });
    return true;
  }
  const route = routeResult.route;
  const routeSnapshot = toRouteSnapshot(route, routeResult);
  let credentialRef: CredentialReference | undefined;
  if (parsed.credentialRef) {
    try {
      ctx.credentialPolicy?.assertStorageAllowed(parsed.credentialRef.source);
      if (parsed.credentialRef.providerId !== route.providerId) {
        json(res, 400, { error: "credentialRef providerId mismatch", run_id: runId });
        return true;
      }
      credentialRef = parsed.credentialRef;
    } catch (e) {
      json(res, 403, { error: e instanceof Error ? e.message : String(e), run_id: runId });
      return true;
    }
  }
  const runtime = ctx.runtimeResolver(route.runtimeId);
  if (!runtime) {
    json(res, 400, { error: `runtime not found: ${route.runtimeId}`, run_id: runId });
    return true;
  }
  const snapshot = ctx.runs.create(runId);
  snapshot.route_snapshot = routeSnapshot as unknown as Record<string, unknown>;
  ctx.events.emit(runId, "Researcher", "Running", {
    message: "Researcher run started via HTTP",
  });
  try {
    const bundle = await ctx.researcher.runWithRuntime(
      prompt, runId, runtime, route,
      (fact) => { ctx.events.emit(runId, "Researcher", "Running", {
        message: fact.type,
      }); },
      credentialRef,
    );
    await ctx.store.save(runId, "research-bundle", bundle.researcher);
    json(res, 200, {
      run_id: runId, status: "wait-human", route_snapshot: routeSnapshot,
      route_id: route.routeId, evidence_count: bundle.researcher.evidence.length,
      research_bundle_id: bundle.researcher.researcher_id,
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const status = /credential|api.?key|token|secret/i.test(msg) ? 503
      : /HEADER_NOT_ALLOWED/i.test(msg) ? 400 : 502;
    json(res, status, { error: msg, run_id: runId, route_snapshot: routeSnapshot });
    return true;
  }
}

// --- Dispatcher ---

export async function handleResearcherRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  input: Record<string, unknown>,
  ctx: ResearcherHandlerContext | undefined,
): Promise<boolean> {
  if (!ctx) {
    const isResearcherRoute =
      url.pathname === "/api/providers" ||
      url.pathname === "/api/providers/test" ||
      url.pathname === "/api/providers/discover-models" ||
      url.pathname === "/api/researcher/run" ||
      url.pathname.match(/^\/api\/runs\/([^/]+)\/review$/) !== null;
    if (isResearcherRoute) {
      json(res, 501, { error: "researcher API not configured on this server" });
      return true;
    }
    return false;
  }
  if (req.method === "GET" && url.pathname === "/api/providers")
    return handleListProviders(req, res, url, input, ctx);
  if (req.method === "POST" && url.pathname === "/api/providers")
    return handleCreateProvider(req, res, url, input, ctx);
  if (req.method === "POST" && url.pathname === "/api/providers/test")
    return handleProviderTest(req, res, url, input, ctx);
  if (req.method === "POST" && url.pathname === "/api/providers/discover-models")
    return handleDiscoverModels(req, res, url, input, ctx);
  if (req.method === "POST" && url.pathname === "/api/researcher/run")
    return handleResearcherRun(req, res, url, input, ctx);
  const reviewMatch = url.pathname.match(/^\/api\/runs\/([^/]+)\/review$/);
  if (req.method === "POST" && reviewMatch && ctx) {
    // Only handle researcher runs (those with a route_snapshot). Plan-review
    // runs fall through to the existing handler.
    const existing = ctx.runs.get(decodeURIComponent(reviewMatch[1]));
    if (existing?.route_snapshot) {
      return handleReview(req, res, url, input, ctx, decodeURIComponent(reviewMatch[1]));
    }
  }
  return false;
}
