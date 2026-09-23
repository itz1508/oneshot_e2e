/**
 * Researcher Workflow Runtime — shared contracts.
 *
 * One interface, two runtime sources:
 *   - SimulationRuntime: deterministic, offline, credential-free.
 *   - LiveApiRuntime:    talks to a real deployed API; never falls back.
 *
 * The deployed API and its Gemini backend are OUT OF SCOPE for this fixture
 * package (see GEMINI_RUNTIME_HANDOFF.md). This module defines the boundary
 * both runtimes MUST honour.
 */

export type ExecutionMode = "SIMULATION" | "LIVE_API";

/** Kinds of todo state used by the Researcher workflow view. */
export type TodoStatus = "pending" | "in_progress" | "completed";

export interface ResearchTodo {
  readonly id: string;
  readonly content: string;
  readonly status: TodoStatus;
}

export interface ResearchMessage {
  readonly id: string;
  readonly role: "user" | "assistant" | "system";
  readonly content: string;
  readonly createdAtUtc: string;
}

export interface ResearchRequest {
  /** Free-form user question that seeds the Researcher workflow. */
  readonly prompt: string;
  /** Optional caller-supplied correlation id. */
  readonly clientRequestId?: string;
}

export interface ResearchCorrection {
  /** Which todo (by id) the correction applies to; empty = whole plan. */
  readonly targetTodoId?: string;
  /** The human-readable correction body. */
  readonly instruction: string;
}

/** Terminal state of a Researcher submission. */
export type ResearchStatus =
  | "idle"
  | "submitting"
  | "streaming"
  | "awaiting_user"
  | "completed"
  | "cancelled"
  | "failed";

/**
 * Public "AuthStatus" projection. This is intentionally the ONLY authentication
 * surface exposed to the frontend runtime. It carries no secrets.
 *
 * States mirror the Config-UI vocabulary from the runtime handoff.
 */
export type AuthState =
  | "NOT_INSTALLED"
  | "CONFIG_REQUIRED"
  | "CONFIGURED"
  | "VERIFYING"
  | "READY"
  | "ENABLED"
  | "DISABLED"
  | "FAILED"
  | "UNSUPPORTED";

export type AuthenticationMethod = "GOOGLE_LOGIN" | "GEMINI_API_KEY";

/** Safe error codes that MAY be projected to the browser. */
export type SafeAuthErrorCode =
  | "AUTH_REQUIRED"
  | "AUTH_FAILED"
  | "AUTH_EXPIRED"
  | "AUTH_REVOKED"
  | "PROVIDER_UNAVAILABLE"
  | "SCOPE_INSUFFICIENT"
  | "UNKNOWN";

/**
 * Everything the deployed API is allowed to project to the frontend about
 * authentication. Adding `apiKey`, `accessToken`, `refreshToken`, or
 * `clientSecret` here is a security bug caught by the security test suite.
 */
export interface AuthStatus {
  readonly state: AuthState;
  readonly method?: AuthenticationMethod;
  /** Human-readable account label; ONLY populated once approved. */
  readonly accountLabel?: string;
  /** The configured provider id (e.g. "gemini"). Provider-neutral otherwise. */
  readonly providerId?: string;
  /** Supported capabilities the runtime has verified (e.g. ["chat","research"]). */
  readonly capabilities?: readonly string[];
  /** Safe error code, never provider-native raw error bodies. */
  readonly errorCode?: SafeAuthErrorCode;
}

/** Immutable snapshot the UI subscribes to. */
export interface ResearchSnapshot {
  readonly executionMode: ExecutionMode;
  readonly status: ResearchStatus;
  readonly todos: readonly ResearchTodo[];
  readonly messages: readonly ResearchMessage[];
  readonly auth: AuthStatus;
  readonly errorCode?: RuntimeErrorCode;
}

/** Emitted to subscribers whenever the snapshot changes. */
export interface ResearchEvent {
  readonly type:
    | "snapshot"
    | "todos_updated"
    | "message_appended"
    | "auth_changed"
    | "status_changed"
    | "error";
  readonly snapshot: ResearchSnapshot;
}

export type ResearchEventListener = (event: ResearchEvent) => void;

/** The single interface every runtime implements. */
export interface ResearcherRuntime {
  readonly executionMode: ExecutionMode;
  submit(input: ResearchRequest): Promise<void>;
  cancel(): Promise<void>;
  continue(): Promise<void>;
  applyCorrection(correction: ResearchCorrection): Promise<void>;
  subscribe(listener: ResearchEventListener): () => void;
  getSnapshot(): ResearchSnapshot;
}

/** Error codes surfaced by the runtime (safe to project to UI). */
export type RuntimeErrorCode =
  | "AUTHENTICATION_REQUIRED"
  | "AUTHENTICATION_FAILED"
  | "NETWORK_ERROR"
  | "LIVE_API_NOT_CONFIGURED"
  | "CANCELLED"
  | "UNKNOWN";

/** Runtime error classes. Never carry credential material. */
export class RuntimeError extends Error {
  readonly code: RuntimeErrorCode;
  constructor(code: RuntimeErrorCode, message: string) {
    super(message);
    this.name = "RuntimeError";
    this.code = code;
  }
}

export class AuthenticationRequiredError extends RuntimeError {
  constructor(message = "Authentication required for LIVE_API mode.") {
    super("AUTHENTICATION_REQUIRED", message);
    this.name = "AuthenticationRequiredError";
  }
}

export class AuthenticationFailedError extends RuntimeError {
  constructor(message = "Authentication failed for the deployed API.") {
    super("AUTHENTICATION_FAILED", message);
    this.name = "AuthenticationFailedError";
  }
}

export class NetworkError extends RuntimeError {
  constructor(message = "Transport failure reaching the deployed API.") {
    super("NETWORK_ERROR", message);
    this.name = "NetworkError";
  }
}

export class LiveApiNotConfiguredError extends RuntimeError {
  constructor(
    message = "LIVE_API selected but no apiBaseUrl configured. There is no silent fallback to SIMULATION.",
  ) {
    super("LIVE_API_NOT_CONFIGURED", message);
    this.name = "LiveApiNotConfiguredError";
  }
}

/**
 * fetch-shape the LiveApiRuntime depends on. Injected by the caller — the
 * runtime NEVER reads any environment variable and NEVER reaches for a
 * global fetch on its own. This keeps every credential decision on the
 * deployed API side, out of browser reach.
 */
export type FetchLike = (
  input: string,
  init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
  },
) => Promise<{
  ok: boolean;
  status: number;
  body: ReadableStream<Uint8Array> | null;
  text?: () => Promise<string>;
}>;
