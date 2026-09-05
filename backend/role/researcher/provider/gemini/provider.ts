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
import { GeminiWorker } from "./worker-bridge.js";
import type { GeminiConfig, GeminiResearchDraft } from "./types.js";

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

export function loadGeminiConfig(projectRoot: string, model?: string): GeminiConfig {
  const testDraftFile = process.env.ONESHOT_MODE === "test" && process.env.ONESHOT_GEMINI_TEST_DRAFT_FILE
    ? resolve(projectRoot, process.env.ONESHOT_GEMINI_TEST_DRAFT_FILE)
    : undefined;

  const distributionModel =
    model || configuredModel("GEMINI_DISTRIBUTION_MODEL") ||
    (testDraftFile ? "test-distribution" : "");
  const researchModel =
    model || configuredModel("GEMINI_RESEARCH_MODEL") ||
    (testDraftFile ? "test-research" : "");
  const synthesisModel =
    model || configuredModel("GEMINI_SYNTHESIS_MODEL") ||
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
        `Gemini Researcher pipeline is not bound: missing ${missing.join(", ")}`,
      );
    }
    if (!model && new Set([distributionModel, researchModel, synthesisModel]).size !== 3) {
      throw new Error(
        "Gemini Researcher pipeline requires three distinct model bindings: distribution, research, synthesis",
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

export class GeminiModelProvider implements ResearchProvider {
  private workers: GeminiWorker[];
  private cursor = 0;
  private events?: ProcessingEventBus;
  private evidence: ResearchEvidenceCollector;

  constructor(
    private projectRoot: string,
    private config = loadGeminiConfig(projectRoot),
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
    this.workers = Array.from(
      { length: config.workerPoolSize },
      () =>
        new GeminiWorker(projectRoot, config, (runId, event) =>
          this.events?.emit(runId, `Provider:gemini:${event.node}`, event.state, {
            scope: "SUPPORT",
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
        provider: "gemini",
        models: [],
        detail: "Gemini worker pool is empty",
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
        provider: "gemini",
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
      throw new Error("Gemini worker pool is empty");
    const worker = this.workers[this.cursor++ % this.workers.length];
    return await worker.research({ prompt, run_id: runId, evidence });
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const gathered = await this.evidence.collect(prompt);
    let d: GeminiResearchDraft;
    try {
      d = await this.draft(prompt, runId, gathered);
    } catch (error) {
      throw new WorkflowRootCauseError({
        issue: "Gemini Researcher model pipeline failed",
        expected:
          "Gemini distribution -> research -> synthesis pipeline returns one structured research draft",
        actual: error instanceof Error ? error.message : String(error),
        evidence_ids: [],
        required_correction:
          "Correct the three GEMINI_* model bindings, Google authentication/Vertex configuration, or structured model response",
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
      providerSource: `gemini-pipeline:${models.join("->")}`,
      providerProvenance: this.config.useVertexAi
        ? "vertex-ai-native-gemini"
        : "gemini-api-native",
      incompleteIssue: "Gemini research draft incomplete",
      incompleteCorrection:
        "Correct Researcher Gemini pipeline instructions or model response",
    });
  }

  close() {
    for (const w of this.workers) w.close();
  }
}
