import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../../../contracts/schema/types.js";
import { WorkflowRootCauseError } from "../../../../core/root-cause-error.js";
import type { ProcessingEventBus } from "../../../../runtime/event-bus.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "../../provider.js";
import { ResearchEvidenceCollector } from "../../tool/evidence/collector.js";
import { structuredDraftToResearchBundle } from "../structured-draft.js";
import type {
  AnthropicConfig,
  AnthropicResearchDraft,
} from "./types.js";
import { AnthropicWorker } from "./worker-bridge.js";

function positiveInt(value: string | undefined, fallback: number) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

export function loadAnthropicConfig(projectRoot: string): AnthropicConfig {
  const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
  const testDraftFile = mode === "test" && process.env.ONESHOT_ANTHROPIC_TEST_DRAFT_FILE
    ? resolve(projectRoot, process.env.ONESHOT_ANTHROPIC_TEST_DRAFT_FILE)
    : undefined;

  return {
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
    baseUrl:
      process.env.ANTHROPIC_API_BASE || "https://api.anthropic.com/v1",
    workerPoolSize: positiveInt(process.env.ANTHROPIC_NUM_PARALLEL, 2),
    timeoutSeconds: positiveInt(process.env.ANTHROPIC_TIMEOUT_SECONDS, 300),
    maxTokens: positiveInt(process.env.ANTHROPIC_MAX_TOKENS, 4096),
    testDraftFile,
  };
}

export class AnthropicModelProvider implements ResearchProvider {
  private workers: AnthropicWorker[];
  private cursor = 0;
  private events?: ProcessingEventBus;
  private evidence: ResearchEvidenceCollector;

  constructor(
    private projectRoot: string,
    private config = loadAnthropicConfig(projectRoot),
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
    this.workers = Array.from(
      { length: config.workerPoolSize },
      () =>
        new AnthropicWorker(projectRoot, config, (runId, event) =>
          this.events?.emit(
            runId,
            `Provider:anthropic:${event.node}`,
            event.state,
            { scope: "SUPPORT", message: event.message },
          ),
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
        provider: "anthropic",
        models: [this.config.model],
        detail: "Anthropic worker pool is empty",
      };
    }
    try {
      const health = await this.workers[0].health(runId);
      return {
        ready: health.ready,
        provider: health.provider,
        models: [health.model],
        detail: health.detail || health.api_base,
      };
    } catch (error) {
      return {
        ready: false,
        provider: "anthropic",
        models: [this.config.model],
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
      throw new Error("Anthropic worker pool is empty");
    const worker = this.workers[this.cursor++ % this.workers.length];
    return await worker.research({ prompt, run_id: runId, evidence });
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const gathered = await this.evidence.collect(prompt);
    let d: AnthropicResearchDraft;
    try {
      d = await this.draft(prompt, runId, gathered);
    } catch (error) {
      throw new WorkflowRootCauseError({
        issue: "Anthropic Researcher model pipeline failed",
        expected:
          "Anthropic Claude returns a structured research draft",
        actual: error instanceof Error ? error.message : String(error),
        evidence_ids: [],
        required_correction:
          "Correct the ANTHROPIC_API_KEY, model binding, Anthropic runtime, or structured model response",
        recheck_target: runId,
      });
    }

    return await structuredDraftToResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft: d,
      gathered,
      providerSource: `anthropic:${this.config.model}`,
      providerProvenance: "remote-anthropic-api",
      incompleteIssue: "Anthropic research draft incomplete",
      incompleteCorrection:
        "Correct Researcher Anthropic pipeline instructions or model response",
    });
  }

  close() {
    for (const w of this.workers) w.close();
  }
}
