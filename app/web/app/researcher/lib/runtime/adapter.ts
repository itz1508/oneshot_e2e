import type { ChatMessage, ProviderSettings } from "../../types";
import type { RunEvent } from "./events";

export interface StartRunOptions {
  settings: ProviderSettings;
  history: ChatMessage[];
  sessionId: string;
  onEvent: (event: RunEvent) => void;
}

/**
 * Stub runtime adapter.
 *
 * In production this should connect to the local browser runtime or the Python
 * backend via Server-Sent Events / WebSocket. For layout work it simulates a run
 * so the UI has data to render.
 */
export function startRun({ onEvent }: StartRunOptions): { abort: () => void; done: Promise<void> } {
  let aborted = false;
  const abort = () => {
    aborted = true;
  };

  const done = new Promise<void>((resolve) => {
    const emit = (ev: RunEvent) => {
      if (!aborted) onEvent(ev);
    };

    emit({ type: "status", text: "Searching the web…" });
    emit({ type: "tool_start", toolId: "t1", name: "tavily_search", input: { query: "stub" } });

    setTimeout(() => {
      if (aborted) return;
      emit({ type: "tool_progress", toolId: "t1", text: "Found 3 sources" });
      emit({
        type: "sources",
        sources: [
          { index: 1, url: "https://example.com/one", title: "Example source one", snippet: "A sample snippet." },
          { index: 2, url: "https://example.com/two", title: "Example source two", snippet: "Another sample snippet." },
        ],
      });
      emit({ type: "tool_end", toolId: "t1", outputSummary: "3 sources returned." });
      emit({ type: "status", text: "Writing answer…" });

      const tokens = [
        "This ",
        "is ",
        "a ",
        "stub ",
        "answer. ",
        "Wire ",
        "the ",
        "runtime ",
        "adapter ",
        "to ",
        "a ",
        "real ",
        "backend.",
      ];
      let i = 0;
      const interval = setInterval(() => {
        if (aborted) {
          clearInterval(interval);
          resolve();
          return;
        }
        if (i < tokens.length) {
          emit({ type: "token", text: tokens[i] });
          i++;
        } else {
          clearInterval(interval);
          emit({ type: "done", durationSec: 1.2 });
          resolve();
        }
      }, 80);
    }, 600);
  });

  return { abort, done };
}
