import { InMemorySessionService, Runner } from "@google/adk";
import type {
  HashProof,
  Prompt,
  RootCause,
  RunSnapshot,
} from "../contract/types.js";
import { WorkflowInformationRequiredError } from "../core/information-required-error.js";
import { WorkflowRootCauseError } from "../core/root-cause-error.js";
import type { HelpRequest } from "../intent/types.js";
import type { BoundDynamicDependencies } from "../workflow/adk/dynamic-dependencies.js";
import {
  createOneShotDynamicWorkflow,
  toDynamicRootCause,
  type OneShotDynamicResult,
} from "../workflow/adk/dynamic-root-agent.js";
import type { ArtifactStore } from "./artifact-store.js";
import type { ProcessingEventBus } from "./event-bus.js";
import type { RunRepository } from "./run-repository.js";

const APP_NAME = "oneshot-dynamic-workflow";
export type DynamicDependencyFactory = (runId: string) => Promise<BoundDynamicDependencies>;

const VALIDATOR_PROCESSORS = new Set([
  "SchemaValidation",
  "FixtureValidation",
  "GoalValidation",
]);

/**
 * Google ADK wraps a failing dynamic child in DynamicNodeFailError and retains
 * the original exception on `.error`. Unwrap that chain without importing an
 * internal ADK error class so canonical OneShot ROOT_CAUSE and HelpRequest data
 * survive ctx.runNode() boundaries.
 */
function unwrapAdkError(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();

  for (let depth = 0; depth < 16; depth += 1) {
    if (
      current instanceof WorkflowRootCauseError ||
      current instanceof WorkflowInformationRequiredError
    ) {
      return current;
    }
    if (!current || typeof current !== "object" || seen.has(current)) break;
    seen.add(current);

    const record = current as { error?: unknown; cause?: unknown };
    const next = record.error ?? record.cause;
    if (next === undefined || next === current) break;
    current = next;
  }

  return current;
}

/**
 * External runtime facade for the canonical OneShot Google ADK dynamic Workflow.
 * Existing OneShot Roles are imported by connector nodes and invoked through
 * ctx.runNode(); their typed outputs are passed directly to downstream nodes.
 */
export class WorkflowRuntime {
  constructor(
    private events: ProcessingEventBus,
    private runs: RunRepository,
    readonly store: ArtifactStore,
    private bindDependencies: DynamicDependencyFactory,
  ) {}

  private ev(
    runId: string,
    processor: string,
    state: "PENDING" | "RUNNING" | "COMPLETE",
    data: Parameters<ProcessingEventBus["emit"]>[3] = {},
  ): void {
    this.events.emit(runId, processor, state, data);
  }

  private async save(
    runId: string,
    name: string,
    value: unknown,
  ): Promise<string> {
    const path = await this.store.save(runId, name, value);
    this.runs.artifact(runId, name, path);
    return path;
  }

  private finishRoot(
    runId: string,
    rootCause: RootCause,
    proof?: HashProof,
    helpRequest?: HelpRequest,
  ): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.result) return current;

    if (helpRequest) {
      this.ev(runId, "HelpRequest", "RUNNING", { scope: "SUPPORT" });
      this.ev(runId, "HelpRequest", "COMPLETE", {
        scope: "SUPPORT",
        result: "ROOT_CAUSE",
        artifact_id: helpRequest.request_id,
        message: helpRequest.question,
      });
    }

    this.ev(runId, "Done", "RUNNING");
    this.ev(runId, "Done", "COMPLETE", {
      result: "ROOT_CAUSE",
      message: rootCause.actual,
    });
    return this.runs.finish(
      runId,
      "ROOT_CAUSE",
      proof,
      rootCause,
      helpRequest,
    );
  }

  private finishPassed(runId: string, proof: HashProof): RunSnapshot {
    const current = this.runs.require(runId);
    if (current.result) return current;

    this.ev(runId, "Done", "RUNNING");
    this.ev(runId, "Done", "COMPLETE", {
      result: "PASSED",
      artifact_id: proof.created_hash,
    });
    return this.runs.finish(runId, "PASSED", proof);
  }

  /** Execute one complete canonical job through ADK Workflow + ctx.runNode(). */
  async run(runId: string, prompt: Prompt): Promise<RunSnapshot> {
    const order = [
      "Researcher",
      "Planner",
      "Refactor",
      "GapAnalysis",
      "Evaluation",
      "SchemaValidation",
      "FixtureValidation",
      "GoalValidation",
      "TripleValidation",
      "Confirmed",
      "CreateHash",
      "Builder",
      "Hash",
      "Done",
    ];
    for (const processor of order) this.ev(runId, processor, "PENDING");

    let bound: BoundDynamicDependencies | undefined;
    try {
      bound = await this.bindDependencies(runId);
      const rootAgent = createOneShotDynamicWorkflow(bound, {
        event: (jobId, processor, state, data = {}) => {
          // Triple Validation is an internal validation gate, not a workflow
          // completion result. Keep its public event vocabulary VALID/NOT_VALID.
          if (
            processor === "TripleValidation" &&
            state === "COMPLETE" &&
            data.result === "PASSED"
          ) {
            this.ev(jobId, processor, state, { ...data, result: "VALID" });
            return;
          }
          this.ev(jobId, processor, state, data);
        },
        save: (jobId, name, value) => this.save(jobId, name, value),
      });
      const sessionService = new InMemorySessionService();
      const runner = new Runner({
        appName: APP_NAME,
        agent: rootAgent,
        sessionService,
      });
      const session = await sessionService.createSession({
        appName: APP_NAME,
        userId: runId,
        sessionId: runId,
      });

      let terminal: OneShotDynamicResult | undefined;
      const projectedValidatorRuns = new Set<string>();
      for await (const event of runner.runAsync({
        userId: runId,
        sessionId: session.id,
        newMessage: {
          role: "user",
          parts: [{ text: JSON.stringify({ job_id: runId, prompt }) }],
        },
      })) {
        const adkEvent = event as unknown as {
          author?: string;
          output?: unknown;
          nodeInfo?: { path?: string };
          invocationId?: string;
        };

        // ADK FunctionNode output is the authoritative response from each
        // parallel validator. Project those real responses into Task events;
        // do not synthesize validator progress in the frontend.
        if (
          adkEvent.author &&
          VALIDATOR_PROCESSORS.has(adkEvent.author) &&
          adkEvent.output &&
          typeof adkEvent.output === "object"
        ) {
          const validation = adkEvent.output as {
            result?: "VALID" | "NOT_VALID";
            plan_id?: string;
          };
          const projectionKey = `${adkEvent.nodeInfo?.path ?? adkEvent.author}:${adkEvent.invocationId ?? ""}`;
          if (
            validation.result &&
            !projectedValidatorRuns.has(projectionKey)
          ) {
            projectedValidatorRuns.add(projectionKey);
            this.ev(runId, adkEvent.author, "RUNNING", {
              message: "ADK validator node response received",
            });
            this.ev(runId, adkEvent.author, "COMPLETE", {
              result: validation.result,
              artifact_id: validation.plan_id,
            });
          }
        }

        if ("output" in event && event.output !== undefined) {
          terminal = event.output as OneShotDynamicResult;
        }
      }

      if (!terminal) {
        throw new Error("ADK dynamic Workflow completed without terminal output");
      }
      if (terminal.result === "PASSED") {
        return this.finishPassed(runId, terminal.hash_proof);
      }
      return this.finishRoot(
        runId,
        terminal.root_cause,
        terminal.hash_proof,
      );
    } catch (error) {
      const current = this.runs.require(runId);
      if (current.result) return current;
      const underlying = unwrapAdkError(error);
      return this.finishRoot(
        runId,
        toDynamicRootCause(underlying, runId),
        undefined,
        underlying instanceof WorkflowInformationRequiredError
          ? underlying.helpRequest
          : undefined,
      );
    } finally {
      await bound?.release();
    }
  }
}
