import type { Prompt, ResearchBundle } from "../../../../../backend/contracts/schema/types.js";
import { WorkflowRootCauseError } from "../../../../../backend/core/root-cause-error.js";
import type { ProcessingEventBus } from "../../../../../backend/runtime/event-bus.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "../../provider.js";
import { ResearchEvidenceCollector } from "../../../../../backend/agents/researcher/tool/evidence/collector.js";
import {
  structuredDraftToResearchBundle,
  type StructuredResearchDraft,
} from "../structured-draft.js";
import { errorMessage } from "./env.js";
import type { ProviderWorkerEvent, WorkerPoolConfig } from "./types.js";

export interface ProviderWorker<
  TDraft = StructuredResearchDraft,
  THealth = unknown,
> {
  health(runId: string): Promise<THealth>;
  research(payload: {
    prompt: unknown;
    run_id: string;
    evidence?: unknown;
  }): Promise<TDraft>;
  close(): void;
}

export interface ProviderHealth {
  ready: boolean;
  provider: string;
}

export interface ProviderDescriptor<TConfig, THealth extends ProviderHealth> {
  /** Lower-case provider id reported in readiness and error payloads. */
  provider: string;
  /** Display label used in diagnostic strings. */
  label: string;
  /** Event processor prefix, e.g. "Provider:anthropic". */
  eventPrefix: string;
  /** Models reported when health polling fails. */
  fallbackModels(config: TConfig): string[];
  /** Models reported when the worker pool has not been created. */
  emptyPoolModels?(config: TConfig): string[];
  healthModels(health: THealth): string[];
  healthDetail(health: THealth): string;
  /** WorkflowRootCauseError strings for draft pipeline failures. */
  issue: string;
  expected(config: TConfig): string;
  requiredCorrection: string;
  providerSource(config: TConfig): string;
  providerProvenance(config: TConfig): string;
  incompleteIssue: string;
  incompleteCorrection: string;
  /**
   * Python workers emit uppercase legacy states ("RUNNING"/"COMPLETE"); the
   * canonical event stream carries ExecutionStatus ("Running"/"Completed").
   */
  normalizeState?(state: string): "Running" | "Completed" | "Failed";
}

/**
 * Shared worker-pool ResearchProvider: owns the evidence collector, a
 * round-robin pool of per-provider workers, readiness polling, event
 * forwarding, and the canonical draft -> bundle conversion. Provider-specific
 * strings and worker construction are supplied via the descriptor.
 */
export class WorkerPoolResearchProvider<
  TConfig extends WorkerPoolConfig,
  THealth extends ProviderHealth,
  TDraft extends StructuredResearchDraft = StructuredResearchDraft,
> implements ResearchProvider {
  private workers: ProviderWorker<TDraft, THealth>[];
  private cursor = 0;
  private events?: ProcessingEventBus;
  private readonly evidence: ResearchEvidenceCollector;

  protected constructor(
    private readonly projectRoot: string,
    protected readonly config: TConfig,
    private readonly descriptor: ProviderDescriptor<TConfig, THealth>,
    createWorker: (
      projectRoot: string,
      config: TConfig,
      onEvent: (runId: string, event: ProviderWorkerEvent) => void,
    ) => ProviderWorker<TDraft, THealth>,
  ) {
    this.evidence = new ResearchEvidenceCollector(projectRoot);
    const { eventPrefix, normalizeState } = descriptor;
    this.workers = Array.from(
      { length: config.workerPoolSize },
      () =>
        createWorker(projectRoot, config, (runId, event) =>
          this.events?.emit(
            runId,
            `${eventPrefix}:${event.node}`,
            normalizeState ? normalizeState(event.state) : event.state,
            { scope: "SUPPORT", message: event.message },
          ),
        ),
    );
  }

  attachEvents(events: ProcessingEventBus) {
    this.events = events;
  }

  async ready(runId: string): Promise<ResearchProviderReadiness> {
    const d = this.descriptor;
    if (!this.workers.length) {
      return {
        ready: false,
        provider: d.provider,
        models: d.emptyPoolModels
          ? d.emptyPoolModels(this.config)
          : d.fallbackModels(this.config),
        detail: `${d.label} worker pool is empty`,
      };
    }
    try {
      const health = await this.workers[0].health(runId);
      return {
        ready: health.ready,
        provider: health.provider,
        models: d.healthModels(health),
        detail: d.healthDetail(health),
      };
    } catch (error) {
      return {
        ready: false,
        provider: d.provider,
        models: d.fallbackModels(this.config),
        detail: errorMessage(error),
      };
    }
  }

  private async draft(
    prompt: Prompt,
    runId: string,
    evidence: Awaited<ReturnType<ResearchEvidenceCollector["collect"]>>,
  ) {
    if (!this.workers.length)
      throw new Error(`${this.descriptor.label} worker pool is empty`);
    const worker = this.workers[this.cursor++ % this.workers.length];
    return await worker.research({ prompt, run_id: runId, evidence });
  }

  async research(prompt: Prompt, runId: string): Promise<ResearchBundle> {
    const gathered = await this.evidence.collect(prompt);
    let draft: TDraft;
    try {
      draft = await this.draft(prompt, runId, gathered);
    } catch (error) {
      const d = this.descriptor;
      throw new WorkflowRootCauseError({
        issue: d.issue,
        expected: d.expected(this.config),
        actual: errorMessage(error),
        evidence_ids: [],
        required_correction: d.requiredCorrection,
        recheck_target: runId,
      });
    }

    return await structuredDraftToResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft,
      gathered,
      providerSource: this.descriptor.providerSource(this.config),
      providerProvenance: this.descriptor.providerProvenance(this.config),
      incompleteIssue: this.descriptor.incompleteIssue,
      incompleteCorrection: this.descriptor.incompleteCorrection,
    });
  }

  close() {
    for (const worker of this.workers) worker.close();
  }
}
