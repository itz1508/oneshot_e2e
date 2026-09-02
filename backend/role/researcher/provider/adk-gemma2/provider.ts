import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../../../contract/types.js";
import type { ProcessingEventBus } from "../../../../runtime/event-bus.js";
import type { ResearchProvider } from "../../provider.js";
import { WorkflowRootCauseError } from "../../../../core/root-cause-error.js";
import { ResearchEvidenceCollector } from "../../tool/evidence/collector.js";
import { structuredDraftToResearchBundle } from "../structured-draft.js";
import { AdkGemmaWorker } from "./worker-bridge.js";
import type { AdkGemmaConfig, AdkResearchDraft } from "./types.js";

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadAdkGemmaConfig(projectRoot: string): AdkGemmaConfig {
  return {
    model: process.env.GEMMA2_LOCAL_MODEL || "gemma2:9b",
    ollamaBaseUrl:
      process.env.OLLAMA_API_BASE ||
      `http://${process.env.GEMMA2_LOCAL_HOST || "localhost"}:${process.env.GEMMA2_LOCAL_PORT || "11434"}`,
    workerPoolSize: positiveInt(process.env.GEMMA2_NUM_PARALLEL, 2),
    cacheUrl: process.env.REDIS_URL || process.env.CACHE_URL || undefined,
    cacheTtlSeconds: positiveInt(process.env.CACHE_TTL, 3600),
    autoPull:
      (process.env.GEMMA2_AUTO_PULL || "true").toLowerCase() === "true",
    timeoutSeconds: positiveInt(process.env.GEMMA2_TIMEOUT_SECONDS, 300),
    testDraftFile: process.env.ONESHOT_ADK_TEST_DRAFT_FILE
      ? resolve(projectRoot, process.env.ONESHOT_ADK_TEST_DRAFT_FILE)
      : undefined,
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

  private async draft(
    prompt: Prompt,
    runId: string,
    evidence: Awaited<ReturnType<ResearchEvidenceCollector["collect"]>>,
  ) {
    if (!this.workers.length)
      throw new Error("ADK Gemma worker pool is empty");
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
        issue: "ADK Gemma 2 research provider failed",
        expected: `Google ADK with ollama_chat/${this.config.model} returns a structured research draft within ${this.config.timeoutSeconds}s`,
        actual: error instanceof Error ? error.message : String(error),
        evidence_ids: [],
        required_correction:
          "Start Ollama, ensure Gemma 2 is available, install requirements/provider-adk.txt, and correct the provider/runtime failure",
        recheck_target: runId,
      });
    }

    return await structuredDraftToResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft: d,
      gathered,
      providerSource: `google-adk:${this.config.model}`,
      providerProvenance: "local-gemma2-ollama",
      incompleteIssue: "ADK research draft incomplete",
      incompleteCorrection:
        "Correct Researcher ADK instruction or model response",
    });
  }

  close() {
    for (const w of this.workers) w.close();
  }
}
