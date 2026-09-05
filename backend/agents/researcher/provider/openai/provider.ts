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
  OpenAIConfig,
  OpenAIResearchDraft,
} from "./types.js";
import { OpenAIWorker } from "./worker-bridge.js";

function positiveInt(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function loadOpenAIConfig(projectRoot: string): OpenAIConfig {
  const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
  const testDraftFile =
    mode === "test" && process.env.ONESHOT_OPENAI_TEST_DRAFT_FILE
      ? resolve(
          projectRoot,
          process.env.ONESHOT_OPENAI_TEST_DRAFT_FILE,
        )
      : undefined;

  return {
    model: process.env.OPENAI_MODEL || "gpt-4o-mini",
    baseUrl:
      process.env.OPENAI_API_BASE || "https://api.openai.com/v1",
    workerPoolSize: positiveInt(process.env.OPENAI_NUM_PARALLEL, 2),
    timeoutSeconds: positiveInt(
      process.env.OPENAI_TIMEOUT_SECONDS,
      300,
    ),
    maxTokens: positiveInt(process.env.OPENAI_MAX_TOKENS, 4096),
    appUrl: process.env.OPENAI_APP_URL || undefined,
    testDraftFile,
  };
}

export class OpenAIModelProvider implements ResearchProvider {
  private workers: OpenAIWorker[];
  private cursor = 0;
  private events?: ProcessingEventBus;
  private evidence: ResearchEvidenceCollector;

  constructor(
    private projectRoot: string,
    private config = loadOpenAIConfig(projectRoot),
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
    this.workers = Array.from(
      { length: config.workerPoolSize },
      () =>
        new OpenAIWorker(projectRoot, config, (runId, event) =>
          this.events?.emit(
            runId,
            `Provider:openai:${event.node}`,
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
        provider: "openai",
        models: [this.config.model],
        detail: "OpenAI worker pool is empty",
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
        provider: "openai",
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
    if (!this.workers.length) {
      throw new Error("OpenAI worker pool is empty");
    }
    const worker = this.workers[this.cursor++ % this.workers.length];
    return await worker.research({ prompt, run_id: runId, evidence });
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const gathered = await this.evidence.collect(prompt);
    let draft: OpenAIResearchDraft;
    try {
      draft = await this.draft(prompt, runId, gathered);
    } catch (error) {
      throw new WorkflowRootCauseError({
        issue: "OpenAI research provider failed",
        expected: `OpenAI ${this.config.model} returns a structured research draft within ${this.config.timeoutSeconds}s`,
        actual: error instanceof Error ? error.message : String(error),
        evidence_ids: [],
        required_correction:
          "Set OPENAI_API_KEY, install requirements/openai.txt, and correct the provider or model response",
        recheck_target: runId,
      });
    }

    return await structuredDraftToResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft,
      gathered,
      providerSource: `openai:${this.config.model}`,
      providerProvenance: "remote-openai-compatible",
      incompleteIssue: "OpenAI research draft incomplete",
      incompleteCorrection:
        "Correct the Researcher instruction or OpenAI model response",
    });
  }

  close() {
    for (const worker of this.workers) worker.close();
  }
}
