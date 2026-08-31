import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../../../contract/types.js";
import { WorkflowRootCauseError } from "../../../../core/root-cause-error.js";
import type { ProcessingEventBus } from "../../../../runtime/event-bus.js";
import type { ResearchProvider } from "../../provider.js";
import { ResearchEvidenceCollector } from "../../tool/evidence/collector.js";
import { structuredDraftToResearchBundle } from "../structured-draft.js";
import type {
  FeatherlessConfig,
  FeatherlessResearchDraft,
} from "./types.js";
import { FeatherlessWorker } from "./worker-bridge.js";

function positiveInt(value: string | undefined, fallback: number) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export function loadFeatherlessConfig(projectRoot: string): FeatherlessConfig {
  const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
  const testDraftFile =
    mode !== "production" && process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE
      ? resolve(
          projectRoot,
          process.env.ONESHOT_FEATHERLESS_TEST_DRAFT_FILE,
        )
      : undefined;

  return {
    model: process.env.FEATHERLESS_MODEL || "google/gemma-4-31B-it",
    baseUrl:
      process.env.FEATHERLESS_API_BASE || "https://api.featherless.ai/v1",
    workerPoolSize: positiveInt(process.env.FEATHERLESS_NUM_PARALLEL, 2),
    timeoutSeconds: positiveInt(
      process.env.FEATHERLESS_TIMEOUT_SECONDS,
      300,
    ),
    maxTokens: positiveInt(process.env.FEATHERLESS_MAX_TOKENS, 4096),
    appUrl: process.env.FEATHERLESS_APP_URL || undefined,
    testDraftFile,
  };
}

export class FeatherlessResearchProvider implements ResearchProvider {
  private workers: FeatherlessWorker[];
  private cursor = 0;
  private events?: ProcessingEventBus;
  private evidence: ResearchEvidenceCollector;

  constructor(
    private projectRoot: string,
    private config = loadFeatherlessConfig(projectRoot),
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
    this.workers = Array.from(
      { length: config.workerPoolSize },
      () =>
        new FeatherlessWorker(projectRoot, config, (runId, event) =>
          this.events?.emit(
            runId,
            `Provider:featherless:${event.node}`,
            event.state,
            { scope: "SUPPORT", message: event.message },
          ),
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
    if (!this.workers.length) {
      throw new Error("Featherless worker pool is empty");
    }
    const worker = this.workers[this.cursor++ % this.workers.length];
    return await worker.research({ prompt, run_id: runId, evidence });
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const gathered = await this.evidence.collect(prompt);
    let draft: FeatherlessResearchDraft;
    try {
      draft = await this.draft(prompt, runId, gathered);
    } catch (error) {
      throw new WorkflowRootCauseError({
        issue: "Featherless research provider failed",
        expected: `Featherless ${this.config.model} returns a structured research draft within ${this.config.timeoutSeconds}s`,
        actual: error instanceof Error ? error.message : String(error),
        evidence_ids: [],
        required_correction:
          "Set FEATHERLESS_API_KEY, install requirements-featherless.txt, and correct the provider or model response",
        recheck_target: runId,
      });
    }

    return await structuredDraftToResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft,
      gathered,
      providerSource: `featherless:${this.config.model}`,
      providerProvenance: "remote-featherless-openai-compatible",
      incompleteIssue: "Featherless research draft incomplete",
      incompleteCorrection:
        "Correct the Researcher instruction or Featherless model response",
    });
  }

  close() {
    for (const worker of this.workers) worker.close();
  }
}
