import type {
  PipelineIssue,
  PipelineStage,
  StageOutcome,
} from "./stage-outcome.js";
import type { FinalizationIntent } from "../workflow/canonical-transition.js";

export interface RedisCheckpointClient {
  get(
    key: string,
  ): Promise<string | null>;

  set(
    key: string,
    value: string,
    ...args: Array<string | number>
  ): Promise<unknown>;

  eval(
    script: string,
    numberOfKeys: number,
    ...args: string[]
  ): Promise<unknown>;
}

export type TransitionState =
  | "none"
  | "pending"
  | "committed";

export type TerminalState =
  | "none"
  | "pending"
  | "committed";

/*
 * The workflow status is always "Done" at terminalization; the variable part
 * is the semantic issue ("Root Cause" | "Missing") carried alongside it.
 */
export type TerminalIssue = PipelineIssue;

export interface StageIdentity {
  runId: string;
  stage: PipelineStage;
  iteration: number;
}

const THIRTY_DAYS_SECONDS =
  60 * 60 * 24 * 30;

const SAVE_EXECUTION_SCRIPT = `
if ARGV[3] ~= "" and redis.call("GET", KEYS[3]) ~= ARGV[3] then
  return 0
end
redis.call(
  "SET",
  KEYS[1],
  ARGV[1],
  "EX",
  ARGV[2]
)

redis.call(
  "SET",
  KEYS[2],
  "1",
  "EX",
  ARGV[2]
)

return 1
`;

export class PipelineCheckpoints {
  constructor(
    private readonly redis:
      RedisCheckpointClient,
  ) {}

  private baseKey(
    identity: StageIdentity,
  ): string {
    return [
      "oneshot",
      "run",
      identity.runId,
      "iteration",
      String(identity.iteration),
      "stage",
      identity.stage,
    ].join(":");
  }

  private outcomeKey(
    identity: StageIdentity,
  ): string {
    return `${this.baseKey(identity)}:outcome`;
  }

  private executedKey(
    identity: StageIdentity,
  ): string {
    return `${this.baseKey(identity)}:executed`;
  }

  private transitionKey(
    identity: StageIdentity,
  ): string {
    return `${this.baseKey(identity)}:transition`;
  }

  private finalizationIntentKey(runId: string): string {
    return `oneshot:run:${runId}:finalization-intent`;
  }

  private builderIntentKey(runId: string): string {
    return `oneshot:run:${runId}:builder-intent`;
  }

  async recordBuilderIntent(runId: string): Promise<boolean> {
    const result = await this.redis.set(this.builderIntentKey(runId), new Date().toISOString(), "EX", THIRTY_DAYS_SECONDS, "NX");
    return result === "OK";
  }

  async saveFinalizationIntent(runId: string, intent: FinalizationIntent): Promise<void> {
    await this.redis.set(this.finalizationIntentKey(runId), JSON.stringify(intent), "EX", THIRTY_DAYS_SECONDS);
  }

  async loadFinalizationIntent(runId: string): Promise<FinalizationIntent | null> {
    const raw = await this.redis.get(this.finalizationIntentKey(runId));
    return raw ? JSON.parse(raw) as FinalizationIntent : null;
  }

  async isExecuted(
    identity: StageIdentity,
  ): Promise<boolean> {
    return (
      await this.redis.get(
        this.executedKey(identity),
      )
    ) === "1";
  }

  async loadOutcome<T>(
    identity: StageIdentity,
  ): Promise<StageOutcome<T> | null> {
    const raw =
      await this.redis.get(
        this.outcomeKey(identity),
      );

    if (!raw) {
      return null;
    }

    return JSON.parse(
      raw,
    ) as StageOutcome<T>;
  }

  async saveExecution<T>(
    identity: StageIdentity,
    outcome: StageOutcome<T>,
    lease?: { key: string; token: string },
  ): Promise<void> {
    const result = await this.redis.eval(
      SAVE_EXECUTION_SCRIPT,
      3,
      this.outcomeKey(identity),
      this.executedKey(identity),
      lease?.key ?? "oneshot:no-lease",
      JSON.stringify(outcome),
      String(
        THIRTY_DAYS_SECONDS,
      ),
      lease?.token ?? "",
    );
    if (Number(result) !== 1) throw new Error(`Lease ownership lost before committing ${identity.stage}`);
  }

  async getTransitionState(
    identity: StageIdentity,
  ): Promise<TransitionState> {
    const value =
      await this.redis.get(
        this.transitionKey(identity),
      );

    if (
      value === "pending" ||
      value === "committed"
    ) {
      return value;
    }

    return "none";
  }

  async markTransitionPending(
    identity: StageIdentity,
  ): Promise<void> {
    await this.redis.set(
      this.transitionKey(identity),
      "pending",
      "EX",
      THIRTY_DAYS_SECONDS,
    );
  }

  async markTransitionCommitted(
    identity: StageIdentity,
  ): Promise<void> {
    await this.redis.set(
      this.transitionKey(identity),
      "committed",
      "EX",
      THIRTY_DAYS_SECONDS,
    );
  }

  /* --------------------------------------------------------------
   * Run-level terminal markers.
   *
   * The terminal side effects (runs.finish + Done event) use the same
   * pending/committed pattern as stage transitions:
   *
   *   terminal-state = pending + terminal-result = <result>
   *     ↓
   *   runs.finish() / Done event
   *     ↓
   *   terminal-state = committed
   *
   * A crash between the side effects and the commit leaves an explicit
   * "pending" record reconciliation can finish.
   * -------------------------------------------------------------- */

  private terminalStateKey(
    runId: string,
  ): string {
    return `oneshot:run:${runId}:terminal-state`;
  }

  private terminalIssueKey(
    runId: string,
  ): string {
    return `oneshot:run:${runId}:terminal-issue`;
  }

  async getTerminalState(
    runId: string,
  ): Promise<TerminalState> {
    const value =
      await this.redis.get(
        this.terminalStateKey(runId),
      );

    if (
      value === "pending" ||
      value === "committed"
    ) {
      return value;
    }

    return "none";
  }

  async getTerminalIssue(
    runId: string,
  ): Promise<TerminalIssue | null> {
    const raw =
      await this.redis.get(
        this.terminalIssueKey(runId),
      );

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(
        raw,
      ) as TerminalIssue;
    } catch {
      return null;
    }
  }

  /**
   * Mark the run terminal-pending with the intended issue (if any). The
   * workflow status is always "Done".
   *
   * Uses SET NX so concurrent finishers agree on exactly one issue; the
   * effective (winning) issue is returned.
   */
  async markTerminalPending(
    runId: string,
    issue?: PipelineIssue,
  ): Promise<PipelineIssue | undefined> {
    const acquired =
      await this.redis.set(
        this.terminalStateKey(runId),
        "pending",
        "EX",
        THIRTY_DAYS_SECONDS,
        "NX",
      );

    if (acquired === "OK") {
      await this.redis.set(
        this.terminalIssueKey(runId),
        JSON.stringify(issue ?? null),
        "EX",
        THIRTY_DAYS_SECONDS,
      );

      return issue;
    }

    return await this.getTerminalIssue(
      runId,
    ) ?? undefined;
  }

  async markTerminalCommitted(
    runId: string,
  ): Promise<void> {
    await this.redis.set(
      this.terminalStateKey(runId),
      "committed",
      "EX",
      THIRTY_DAYS_SECONDS,
    );
  }
}
