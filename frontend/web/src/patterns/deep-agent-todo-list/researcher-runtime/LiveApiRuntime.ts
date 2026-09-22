/**
 * LiveApiRuntime — talks to a REAL deployed API. NEVER falls back to
 * SimulationRuntime. NEVER handles credentials directly.
 *
 * Credential ownership is DEPLOYED-RUNTIME-SIDE (see GEMINI_RUNTIME_HANDOFF.md).
 * The frontend runtime sends session-cookie-authenticated requests only; the
 * deployed API exchanges those for the actual Gemini call.
 *
 * INVARIANTS:
 *   - NEVER imports SimulationRuntime.
 *   - NEVER reads process.env or import.meta.env.
 *   - NEVER accepts an API key from the caller.
 *   - NEVER catches an error and continues silently in another mode.
 *   - Cancellation is cooperative via AbortController.
 */

import type {
  AuthStatus,
  FetchLike,
  ResearchCorrection,
  ResearchEvent,
  ResearchEventListener,
  ResearchMessage,
  ResearchRequest,
  ResearchSnapshot,
  ResearchStatus,
  ResearchTodo,
  ResearcherRuntime,
} from "./types";
import {
  AuthenticationFailedError,
  AuthenticationRequiredError,
  LiveApiNotConfiguredError,
  NetworkError,
} from "./types";

export interface LiveApiRuntimeConfig {
  /** Deployed API origin (e.g. "https://api.example.com"). Required. */
  readonly apiBaseUrl: string;
  /** Injected fetch — never a bound global. */
  readonly fetchImpl: FetchLike;
  /** Optional AbortController the caller owns for cancellation. */
  readonly abortController?: AbortController;
}

const EMPTY_TODOS: readonly ResearchTodo[] = Object.freeze([]);
const EMPTY_MESSAGES: readonly ResearchMessage[] = Object.freeze([]);

function makeSnapshot(
  status: ResearchStatus,
  todos: readonly ResearchTodo[],
  messages: readonly ResearchMessage[],
  auth: AuthStatus,
  errorCode?: ResearchSnapshot["errorCode"],
): ResearchSnapshot {
  return Object.freeze({
    executionMode: "LIVE_API" as const,
    status,
    todos: Object.freeze([...todos]),
    messages: Object.freeze([...messages]),
    auth: Object.freeze({ ...auth }),
    errorCode,
  });
}

export class LiveApiRuntime implements ResearcherRuntime {
  readonly executionMode = "LIVE_API" as const;

  private snapshot: ResearchSnapshot;
  private listeners = new Set<ResearchEventListener>();
  private readonly cfg: LiveApiRuntimeConfig;
  private controller: AbortController;

  constructor(cfg: LiveApiRuntimeConfig) {
    if (!cfg || typeof cfg.apiBaseUrl !== "string" || cfg.apiBaseUrl.length === 0) {
      throw new LiveApiNotConfiguredError();
    }
    if (!cfg.fetchImpl) {
      throw new LiveApiNotConfiguredError(
        "LiveApiRuntime requires an injected fetchImpl. There is no silent fallback.",
      );
    }
    this.cfg = cfg;
    this.controller = cfg.abortController ?? new AbortController();
    this.snapshot = makeSnapshot(
      "idle",
      EMPTY_TODOS,
      EMPTY_MESSAGES,
      { state: "CONFIG_REQUIRED", providerId: "gemini" },
    );
  }

  getSnapshot(): ResearchSnapshot {
    return this.snapshot;
  }

  subscribe(listener: ResearchEventListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(type: ResearchEvent["type"]): void {
    const event: ResearchEvent = Object.freeze({ type, snapshot: this.snapshot });
    for (const l of this.listeners) l(event);
  }

  private setSnapshot(next: ResearchSnapshot, type: ResearchEvent["type"]): void {
    this.snapshot = next;
    this.emit(type);
  }

  private url(path: string): string {
    return this.cfg.apiBaseUrl.replace(/\/$/, "") + path;
  }

  async refreshAuthStatus(): Promise<AuthStatus> {
    let res;
    try {
      res = await this.cfg.fetchImpl(this.url("/auth/gemini/status"), {
        method: "GET",
        signal: this.controller.signal,
      });
    } catch (err) {
      throw new NetworkError(
        `Transport failure calling /auth/gemini/status: ${(err as Error).message}`,
      );
    }
    if (!res.ok) {
      if (res.status === 401) throw new AuthenticationRequiredError();
      if (res.status === 403) throw new AuthenticationFailedError();
      throw new NetworkError(`Unexpected /auth/gemini/status status ${res.status}`);
    }
    const bodyText = res.text ? await res.text() : "";
    const parsed = bodyText ? (JSON.parse(bodyText) as AuthStatus) : { state: "UNSUPPORTED" as const };
    // Defensive projection: strip any surprise credential-shaped keys.
    const cleaned: AuthStatus = {
      state: parsed.state,
      method: parsed.method,
      accountLabel: parsed.accountLabel,
      providerId: parsed.providerId ?? "gemini",
      capabilities: parsed.capabilities,
      errorCode: parsed.errorCode,
    };
    this.setSnapshot(
      makeSnapshot(this.snapshot.status, this.snapshot.todos, this.snapshot.messages, cleaned),
      "auth_changed",
    );
    return cleaned;
  }

  async submit(input: ResearchRequest): Promise<void> {
    this.setSnapshot(
      makeSnapshot("submitting", EMPTY_TODOS, [
        {
          id: "m-user-1",
          role: "user",
          content: input.prompt,
          createdAtUtc: new Date(0).toISOString(),
        },
      ], this.snapshot.auth),
      "snapshot",
    );

    let res;
    try {
      res = await this.cfg.fetchImpl(this.url("/research/submit"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: input.prompt, clientRequestId: input.clientRequestId }),
        signal: this.controller.signal,
      });
    } catch (err) {
      // NO SILENT FALLBACK: rethrow as NetworkError, update snapshot to failed.
      this.setSnapshot(
        makeSnapshot("failed", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth, "NETWORK_ERROR"),
        "error",
      );
      throw new NetworkError(`Transport failure calling /research/submit: ${(err as Error).message}`);
    }

    if (!res.ok) {
      if (res.status === 401) {
        this.setSnapshot(
          makeSnapshot("failed", this.snapshot.todos, this.snapshot.messages,
            { ...this.snapshot.auth, state: "CONFIG_REQUIRED", errorCode: "AUTH_REQUIRED" }, "AUTHENTICATION_REQUIRED"),
          "error",
        );
        throw new AuthenticationRequiredError();
      }
      if (res.status === 403) {
        this.setSnapshot(
          makeSnapshot("failed", this.snapshot.todos, this.snapshot.messages,
            { ...this.snapshot.auth, state: "FAILED", errorCode: "AUTH_FAILED" }, "AUTHENTICATION_FAILED"),
          "error",
        );
        throw new AuthenticationFailedError();
      }
      this.setSnapshot(
        makeSnapshot("failed", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth, "NETWORK_ERROR"),
        "error",
      );
      throw new NetworkError(`Unexpected /research/submit status ${res.status}`);
    }

    this.setSnapshot(
      makeSnapshot("streaming", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth),
      "status_changed",
    );

    // Consume the streaming body (SSE-like NDJSON) if present.
    if (res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      // eslint-disable-next-line no-constant-condition
      while (true) {
        let chunk;
        try {
          chunk = await reader.read();
        } catch (err) {
          if (this.controller.signal.aborted) {
            this.setSnapshot(
              makeSnapshot("cancelled", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth, "CANCELLED"),
              "error",
            );
            return;
          }
          throw new NetworkError(`Stream read failure: ${(err as Error).message}`);
        }
        if (chunk.done) break;
        buf += decoder.decode(chunk.value, { stream: true });
        let idx: number;
        while ((idx = buf.indexOf("\n")) !== -1) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (!line) continue;
          this.applyStreamLine(line);
        }
      }
    }

    this.setSnapshot(
      makeSnapshot("awaiting_user", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth),
      "status_changed",
    );
  }

  private applyStreamLine(line: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      return; // malformed line — ignored, no silent mode switch
    }
    const evt = parsed as { type?: string; todos?: ResearchTodo[]; message?: ResearchMessage };
    if (evt.type === "todos" && Array.isArray(evt.todos)) {
      this.setSnapshot(
        makeSnapshot(this.snapshot.status, evt.todos, this.snapshot.messages, this.snapshot.auth),
        "todos_updated",
      );
    } else if (evt.type === "message" && evt.message) {
      this.setSnapshot(
        makeSnapshot(this.snapshot.status, this.snapshot.todos, [...this.snapshot.messages, evt.message], this.snapshot.auth),
        "message_appended",
      );
    }
  }

  async cancel(): Promise<void> {
    this.controller.abort();
    let res;
    try {
      res = await this.cfg.fetchImpl(this.url("/research/cancel"), { method: "POST" });
    } catch (err) {
      // We already aborted locally; surface transport failure explicitly.
      this.setSnapshot(
        makeSnapshot("cancelled", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth, "CANCELLED"),
        "status_changed",
      );
      throw new NetworkError(`Cancel transport failure: ${(err as Error).message}`);
    }
    if (!res.ok && res.status !== 404) {
      throw new NetworkError(`Unexpected /research/cancel status ${res.status}`);
    }
    this.setSnapshot(
      makeSnapshot("cancelled", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth, "CANCELLED"),
      "status_changed",
    );
  }

  async continue(): Promise<void> {
    const res = await this.cfg.fetchImpl(this.url("/research/continue"), { method: "POST" });
    if (!res.ok) {
      throw new NetworkError(`Unexpected /research/continue status ${res.status}`);
    }
    this.setSnapshot(
      makeSnapshot("completed", this.snapshot.todos, this.snapshot.messages, this.snapshot.auth),
      "status_changed",
    );
  }

  async applyCorrection(correction: ResearchCorrection): Promise<void> {
    const res = await this.cfg.fetchImpl(this.url("/research/correction"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(correction),
    });
    if (!res.ok) {
      throw new NetworkError(`Unexpected /research/correction status ${res.status}`);
    }
    this.setSnapshot(
      makeSnapshot(this.snapshot.status, this.snapshot.todos, [
        ...this.snapshot.messages,
        {
          id: `m-correction-${this.snapshot.messages.length}`,
          role: "user",
          content: correction.instruction,
          createdAtUtc: new Date(0).toISOString(),
        },
      ], this.snapshot.auth),
      "message_appended",
    );
  }
}
