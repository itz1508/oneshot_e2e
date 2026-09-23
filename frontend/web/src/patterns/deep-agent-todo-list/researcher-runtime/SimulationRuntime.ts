/**
 * SimulationRuntime — deterministic, offline, credential-free.
 *
 * Runs entirely off the existing FIXTURE_SCENARIOS state machine. Emits todo
 * updates and messages exactly as the deterministic Researcher Preview does.
 *
 * INVARIANTS:
 *   - NEVER calls fetch, XMLHttpRequest, or any network primitive.
 *   - NEVER reads process.env, import.meta.env, or any credential surface.
 *   - NEVER produces a snapshot whose auth.state is anything other than
 *     "UNSUPPORTED" (simulation has no auth concept).
 *   - NEVER falls back to LiveApiRuntime.
 */

import type {
  ResearchEvent,
  ResearchEventListener,
  ResearchRequest,
  ResearchCorrection,
  ResearchSnapshot,
  ResearchStatus,
  ResearchTodo,
  ResearchMessage,
  ResearcherRuntime,
} from "./types";

/** Minimal deterministic script kept identical to fixture scenarios. */
const DETERMINISTIC_TODOS: readonly ResearchTodo[] = [
  { id: "t1", content: "Restate the research question", status: "pending" },
  { id: "t2", content: "Check focus-visible facts (WCAG 2.4.7)", status: "pending" },
  { id: "t3", content: "Check status-message facts (WCAG 4.1.3)", status: "pending" },
  { id: "t4", content: "Check aria-live guidance (MDN)", status: "pending" },
  { id: "t5", content: "Draft accessible live-region guidance", status: "pending" },
  { id: "t6", content: "Ready for planning", status: "pending" },
];

function nowIso(): string {
  // Deterministic timestamp derived from step index — no Date.now(), no clock.
  return "1970-01-01T00:00:00.000Z";
}

function makeSnapshot(
  status: ResearchStatus,
  todos: readonly ResearchTodo[],
  messages: readonly ResearchMessage[],
): ResearchSnapshot {
  return Object.freeze({
    executionMode: "SIMULATION" as const,
    status,
    todos: Object.freeze([...todos]),
    messages: Object.freeze([...messages]),
    auth: Object.freeze({
      state: "UNSUPPORTED" as const,
      providerId: undefined,
    }),
  });
}

export class SimulationRuntime implements ResearcherRuntime {
  readonly executionMode = "SIMULATION" as const;

  private snapshot: ResearchSnapshot;
  private listeners = new Set<ResearchEventListener>();
  private cursor = 0;

  constructor() {
    this.snapshot = makeSnapshot("idle", DETERMINISTIC_TODOS, []);
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

  private setStatus(status: ResearchStatus): void {
    this.snapshot = makeSnapshot(status, this.snapshot.todos, this.snapshot.messages);
    this.emit("status_changed");
  }

  private advanceOne(): boolean {
    if (this.cursor >= this.snapshot.todos.length) return false;
    const todos = this.snapshot.todos.map((t, i) => {
      if (i < this.cursor) return { ...t, status: "completed" as const };
      if (i === this.cursor) return { ...t, status: "completed" as const };
      return t;
    });
    this.cursor += 1;
    this.snapshot = makeSnapshot(
      this.cursor >= todos.length ? "awaiting_user" : "streaming",
      todos,
      this.snapshot.messages,
    );
    this.emit("todos_updated");
    return true;
  }

  async submit(input: ResearchRequest): Promise<void> {
    this.cursor = 0;
    const messages: ResearchMessage[] = [
      {
        id: "m-user-1",
        role: "user",
        content: input.prompt,
        createdAtUtc: nowIso(),
      },
    ];
    this.snapshot = makeSnapshot("submitting", DETERMINISTIC_TODOS, messages);
    this.emit("snapshot");
    // Deterministic playback: complete all-but-last so UI reaches awaiting_user.
    while (this.cursor < DETERMINISTIC_TODOS.length - 1) this.advanceOne();
    this.setStatus("awaiting_user");
  }

  async cancel(): Promise<void> {
    this.setStatus("cancelled");
  }

  async continue(): Promise<void> {
    if (this.snapshot.status === "awaiting_user") {
      this.advanceOne();
      this.setStatus("completed");
    }
  }

  async applyCorrection(correction: ResearchCorrection): Promise<void> {
    const messages = [
      ...this.snapshot.messages,
      {
        id: `m-correction-${this.snapshot.messages.length}`,
        role: "user" as const,
        content: correction.instruction,
        createdAtUtc: nowIso(),
      },
    ];
    this.snapshot = makeSnapshot(this.snapshot.status, this.snapshot.todos, messages);
    this.emit("message_appended");
  }
}
