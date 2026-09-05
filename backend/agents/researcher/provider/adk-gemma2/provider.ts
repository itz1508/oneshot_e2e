import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../../../contracts/schema/types.js";
import type { ProcessingEventBus } from "../../../../runtime/event-bus.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "../../provider.js";
import { WorkflowRootCauseError } from "../../../../core/root-cause-error.js";
import { ResearchEvidenceCollector } from "../../tool/evidence/collector.js";
import { structuredDraftToResearchBundle } from "../structured-draft.js";
import { AdkGemmaWorker } from "./worker-bridge.js";
import type { AdkGemmaConfig, AdkResearchDraft } from "./types.js";

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function configuredModel(name: string): string {
  return (process.env[name] || "").trim();
}

function envTrue(name: string): boolean {
  return /^(?:1|true|yes)$/i.test((process.env[name] || "").trim());
}

export function loadAdkGemmaConfig(projectRoot: string): AdkGemmaConfig {
  const testDraftFile = process.env.ONESHOT_MODE === "test" && process.env.ONESHOT_ADK_TEST_DRAFT_FILE
    ? resolve(projectRoot, process.env.ONESHOT_ADK_TEST_DRAFT_FILE)
    : undefined;

  const distributionModel =
    configuredModel("GEMINI_DISTRIBUTION_MODEL") ||
    (testDraftFile ? "test-distribution" : "");
  const researchModel =
    configuredModel("GEMINI_RESEARCH_MODEL") ||
    (testDraftFile ? "test-research" : "");
  const synthesisModel =
    configuredModel("GEMINI_SYNTHESIS_MODEL") ||
    (testDraftFile ? "test-synthesis" : "");

  if (!testDraftFile) {
    const missing = [
      ["GEMINI_DISTRIBUTION_MODEL", distributionModel],
      ["GEMINI_RESEARCH_MODEL", researchModel],
      ["GEMINI_SYNTHESIS_MODEL", synthesisModel],
    ]
      .filter(([, value]) => !value)
      .map(([name]) => name);
    if (missing.length) {
      throw new Error(
        `Google ADK Researcher pipeline is not bound: missing ${missing.join(", ")}`,
      );
    }
    if (new Set([distributionModel, researchModel, synthesisModel]).size !== 3) {
      throw new Error(
        "Google ADK Researcher pipeline requires three distinct Gemini model bindings: distribution, research, synthesis",
      );
    }
  }

  return {
    distributionModel,
    researchModel,
    synthesisModel,
    googleCloudProject: (process.env.GOOGLE_CLOUD_PROJECT || "").trim() || undefined,
    googleCloudLocation:
      (process.env.GOOGLE_CLOUD_LOCATION || "global").trim() || "global",
    useVertexAi: envTrue("GOOGLE_GENAI_USE_VERTEXAI"),
    workerPoolSize: positiveInt(process.env.GEMINI_NUM_PARALLEL, 2),
    cacheUrl: process.env.REDIS_URL || process.env.CACHE_URL || undefined,
    cacheTtlSeconds: positiveInt(process.env.CACHE_TTL, 3600),
    timeoutSeconds: positiveInt(process.env.GEMINI_TIMEOUT_SECONDS, 300),
    testDraftFile,
  };
}

export class AdkGemmaResearchProvider implements ResearchProvider {
  private workers: AdkGemmaWorker[];
  private cursor = 0;
  private events?: ProcessingEventBus;
  private evidence: ResearchEvidenceCollector;

  constructor(
    private projectRoot: string,
    private config = loadAdkGemmaConfig(projectRoot),
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
    this.workers = Array.from(
      { length: config.workerPoolSize },
      () =>
        new AdkGemmaWorker(projectRoot, config, (runId, event) =>
          this.events?.emit(runId, `ADK:${event.node}`, event.state, {
            scope: "ADK",
            message: event.message,
          }),
        ),
    );
  }

  attachEvents(events: ProcessingEventBus) {
    this.events = events;
  }

  async ready(runId: string): Promise<ResearchProviderReadiness> {
    if (!this.workers.length) {
      return {
        ready: false,
        provider: "google-adk",
        models: [],
        detail: "ADK Gemini worker pool is empty",
      };
    }
    try {
      const health = await this.workers[0].health(runId);
      return {
        ready: health.ready,
        provider: health.provider,
        models: health.models,
        detail: health.detail || `${health.backend}:${health.google_cloud_location || ""}`,
      };
    } catch (error) {
      return {
        ready: false,
        provider: "google-adk",
        models: [
          this.config.distributionModel,
          this.config.researchModel,
          this.config.synthesisModel,
        ],
        detail: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async draft(
    prompt: Prompt,
    runId: string,
    evidence: Awaited<ReturnType<ResearchEvidenceCollector["collect"]>>,
  ) {
    if (!this.workers.length)
      throw new Error("ADK Gemini worker pool is empty");
    const worker = this.workers[this.cursor++ % this.workers.length];
    return await worker.research({ prompt, run_id: runId, evidence });
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const gathered = await this.evidence.collect(prompt);
    let d: AdkResearchDraft;
    try {
      d = await this.draft(prompt, runId, gathered);
    } catch (error) {
      throw new WorkflowRootCauseError({
        issue: "ADK Researcher model pipeline failed",
        expected:
          "Google ADK distribution -> research -> synthesis pipeline returns one structured research draft",
        actual: error instanceof Error ? error.message : String(error),
        evidence_ids: [],
        required_correction:
          "Correct the three GEMINI_* model bindings, Google authentication/Vertex configuration, ADK runtime, or structured model response",
        recheck_target: runId,
      });
    }

    const models = [
      this.config.distributionModel,
      this.config.researchModel,
      this.config.synthesisModel,
    ];
    return await structuredDraftToResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft: d,
      gathered,
      providerSource: `google-adk-pipeline:${models.join("->")}`,
      providerProvenance: this.config.useVertexAi
        ? "vertex-ai-native-adk"
        : "gemini-api-native-adk",
      incompleteIssue: "ADK research draft incomplete",
      incompleteCorrection:
        "Correct Researcher ADK pipeline instructions or model response",
    });
  }

  close() {
    for (const w of this.workers) w.close();
  }
}
