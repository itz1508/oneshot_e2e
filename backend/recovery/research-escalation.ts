import type { EvidenceRef } from "../contracts/schema/types.js";
import type { ProcessingEventBus } from "../runtime/event-bus.js";
import type {
  FailureCategory,
  RecoveryResearchRequest,
  RecoveryResearchResult,
  RootCauseResult,
} from "./types.js";

/**
 * Bounded recovery-research interface over the EXISTING Researcher capability.
 * The researcher answers a focused question and returns evidence + findings.
 * It can never mark a run successful — success only comes from Builder ->
 * Sandbox -> Validation -> Hash Verification.
 */
export interface RecoveryResearcher {
  research(request: RecoveryResearchRequest): Promise<RecoveryResearchResult>;
}

/**
 * Optional Advanced Research collector (Tavily). Must remain optional: when
 * disabled or unavailable the recovery workflow uses local/repository
 * evidence only and never fails merely because Tavily is unavailable.
 */
export interface AdvancedResearchCollector {
  collect(question: string): Promise<EvidenceRef[]>;
}

export interface ResearchEscalationDeps {
  researcher: RecoveryResearcher;
  /** Optional Tavily collector — absent/disabled means local evidence only. */
  advanced?: AdvancedResearchCollector | null;
  events?: ProcessingEventBus;
  runId?: string;
}

export const MAX_RESEARCH_ESCALATIONS_PER_FAILURE = 1;

function focusedQuestion(category: FailureCategory, stage: string): string {
  switch (category) {
    case "PROVIDER_AUTH_FAILURE":
      return "What credential or configuration is missing or rejected for this provider?";
    case "PROVIDER_MODEL_FAILURE":
      return "What model/configuration correction is required for this provider?";
    case "PROVIDER_NETWORK_FAILURE":
      return "What connectivity or endpoint condition produced this failure?";
    case "BUILD_FAILURE":
      return "What does this compiler/build error imply, and what correction should be verified before retrying?";
    case "VALIDATION_FAILURE":
      return "Which schema/fixture/goal expectation changed, and what correction should be verified before retrying?";
    case "SANDBOX_EXECUTION_FAILURE":
      return "What dependency or runtime condition inside the sandbox produced this failure?";
    case "RESEARCH_EVIDENCE_INSUFFICIENT":
      return "What additional repository or external evidence explains this failure?";
    default:
      return `What repository code and configuration is relevant to the failure at stage ${stage}?`;
  }
}

/** Local/repository evidence pass — bounded, deterministic, no network. */
export class LocalRecoveryResearcher implements RecoveryResearcher {
  async research(
    request: RecoveryResearchRequest,
  ): Promise<RecoveryResearchResult> {
    const statements = request.evidence.map((e) => `${e.source}: ${e.statement}`);
    const findings =
      `Local analysis of ${request.failureCategory} at ${request.failedStage}: ` +
      (statements.length
        ? `evidence points to ${statements[0]}`
        : "no prior evidence; repository inspection required") +
      `. Question: ${request.requestedQuestion}`;
    return {
      additionalEvidence: [
        {
          evidence_id: `ev:research:local:${request.failedStage}`,
          source: "research:local",
          statement:
            "Local/repository analysis performed over the collected failure evidence (no external research used).",
          provenance: `recovery-research:${request.failureCategory}`,
        },
      ],
      findings,
      citations: [],
      sources: ["local"],
    };
  }
}

/**
 * One bounded research escalation for a failure cycle:
 *   local researcher first -> optional Tavily pass -> merged result.
 * Tavily failures are swallowed (recorded as a non-fatal note) so the
 * recovery workflow NEVER fails because Tavily is unavailable, and Tavily
 * usage never changes the selected ModelProvider (it only adds evidence).
 */
export async function runResearchEscalation(
  issue: { request: RecoveryResearchRequest; existing: RootCauseResult },
  deps: ResearchEscalationDeps,
): Promise<RecoveryResearchResult> {
  const { request, existing } = issue;
  const question =
    request.requestedQuestion ||
    focusedQuestion(request.failureCategory, request.failedStage);
  const bounded: RecoveryResearchRequest = { ...request, requestedQuestion: question };

  deps.events?.emit(deps.runId ?? "", "ResearchEscalation", "RUNNING", {
    scope: "SUPPORT",
    message: `Recovery research started (${request.failureCategory})`,
  });

  let result = await deps.researcher.research(bounded);

  // Optional Tavily Advanced Research pass — strictly additive evidence.
  const sources = new Set(result.sources);
  if (deps.advanced) {
    try {
      const external = await deps.advanced.collect(question);
      const additional = external.slice(0, 8).map((e) => ({
        evidence_id: `ev:${e.evidence_id || "research:tavily"}`,
        source: e.source || "tavily",
        statement: e.statement,
        provenance: e.provenance || "tavily-advanced-research",
      }));
      if (additional.length) {
        result = {
          additionalEvidence: [...result.additionalEvidence, ...additional],
          findings: `${result.findings} External research contributed ${additional.length} item(s).`,
          citations: [...result.citations, ...additional.map((e) => e.provenance)].slice(0, 12),
          sources: [...sources, "tavily"],
        };
      }
    } catch {
      // Tavily unavailable/disabled/misconfigured — non-fatal by contract.
      result = {
        ...result,
        findings: `${result.findings} External research (Tavily) was unavailable; local evidence only.`,
        sources: [...sources],
      };
    }
  }

  deps.events?.emit(deps.runId ?? "", "ResearchEscalation", "COMPLETE", {
    scope: "SUPPORT",
    result: existing.category === "RESEARCH_EVIDENCE_INSUFFICIENT" ? "ROOT_CAUSE" : undefined,
    message: `Recovery research completed via ${[...sources].join("+") || "local"}`,
  });

  return result;
}