import {
  BaseAgent,
  createEvent,
  createEventActions,
  type Event,
  type InvocationContext,
} from "@google/adk";
import { ADK_STATE, state } from "./state.js";

export interface StageOutcome {
  stateDelta?: Record<string, unknown>;
  escalate?: boolean;
}

export type StageHandler = (
  ctx: InvocationContext,
) => Promise<StageOutcome | void>;

/**
 * Adapter that lets deterministic OneShot role/workflow functions participate
 * as real ADK BaseAgent children without converting them into LLM calls.
 */
export class OneShotStageAgent extends BaseAgent {
  private readonly handler: StageHandler;
  private readonly runAfterRootCause: boolean;

  constructor(config: {
    name: string;
    description: string;
    handler: StageHandler;
    runAfterRootCause?: boolean;
  }) {
    super({ name: config.name, description: config.description });
    this.handler = config.handler;
    this.runAfterRootCause = config.runAfterRootCause ?? false;
  }

  protected async *runAsyncImpl(
    ctx: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    if (!this.runAfterRootCause && state.rootCause(ctx)) {
      yield createEvent({
        author: this.name,
        actions: createEventActions(),
      });
      return;
    }

    const result = ((await this.handler(ctx)) ?? {}) as StageOutcome;
    yield createEvent({
      author: this.name,
      actions: createEventActions({
        stateDelta: result.stateDelta ?? {},
        ...(result.escalate === undefined
          ? {}
          : { escalate: result.escalate }),
      }),
    });
  }

  protected async *runLiveImpl(
    _ctx: InvocationContext,
  ): AsyncGenerator<Event, void, void> {
    return;
  }
}

export function rootCauseDelta(rootCause: unknown): Record<string, unknown> {
  return { [ADK_STATE.rootCause]: rootCause };
}
