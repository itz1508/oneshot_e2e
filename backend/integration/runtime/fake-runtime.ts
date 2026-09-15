import { DEFAULT_ROUTING_POLICY } from "../core/policy.js";
import type { ResolvedExecutionRoute } from "../core/route.js";
import type {
  AgentRuntime,
  NormalizedResult,
  RuntimeInvocation,
} from "./types.js";

/**
 * Deterministic fake runtime for the M4 neutrality proof. Consumes a
 * `ResolvedExecutionRoute` and returns a stable `NormalizedResult` with NO
 * external calls. The structured payload is a valid `StructuredResearchDraft`
 * (mirrors the proven shape in `researcher-validation-case.test.ts`) so the
 * Researcher workflow can run end-to-end without any provider.
 *
 * Output is a pure function of `promptText` (and the route identity), so it
 * is fully deterministic.
 */
export class FakeRuntime implements AgentRuntime {
  readonly runtimeId = "fake";

  async invoke(invocation: RuntimeInvocation): Promise<NormalizedResult> {
    const { route, promptText } = invocation;
    const head = promptText.slice(0, 80);
    const draft = {
      summary: `Fake research summary for: ${head}`,
      requirements: [
        "Preserve canonical workflow traceability via fake runtime",
        "Produce a deterministic structured draft",
      ],
      dependencies: [
        { description: "fake-runtime", required_by: [0] as number[] },
      ],
      plan_steps: [
        {
          description: "Deterministic fake research step",
          responsibility: "ResearchPlan",
          requirement_indexes: [0, 1] as number[],
        },
      ],
      success_meaning:
        "Fake runtime produced a deterministic canonical bundle",
      success_criteria: [
        {
          statement: "Fake draft yields a valid ResearchBundle",
          measurement: "canonical schemas validate",
          expected_result: "PASSED",
          requirement_indexes: [0] as number[],
        },
      ],
      deliverable: "",
    };
    return {
      routeId: route.routeId,
      workflowId: route.workflowId,
      content: JSON.stringify(draft),
      structured: draft,
      evidence: [
        {
          source: "fake-runtime",
          statement: "deterministic evidence from fake runtime",
          provenance: "fake-runtime",
        },
      ],
      finishReason: "stop",
    };
  }
}

/**
 * Build a minimal hand-built `ResolvedExecutionRoute` for the M4 fake proof.
 * The deterministic router (M7) replaces this with a routed snapshot; this
 * scaffold only proves the runtime consumes a route. Non-secret, no creds.
 */
export function buildFakeRoute(runId: string): ResolvedExecutionRoute {
  const now = new Date().toISOString();
  return {
    routeId: `fake-route:${runId}`,
    workflowId: "researcher",
    policy: DEFAULT_ROUTING_POLICY,
    runtimeId: "fake",
    providerId: "fake-provider",
    endpointId: "fake-endpoint",
    baseUrl: "http://fake.invalid",
    modelId: "fake-model",
    transport: "openai-chat",
    locality: "unknown",
    capabilities: [
      { capability: "tool-use", state: "verified", source: "probe" },
      { capability: "structured-output", state: "verified", source: "probe" },
    ],
    researchMode: "disabled",
    routeReason: "M4 fake runtime proof: hand-built route (router arrives in M7)",
    rejectedCandidates: [],
    createdAt: now,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
