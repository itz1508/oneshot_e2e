import type { ServerSentEvent } from "./contracts";

export interface EventStreamCallbacks {
  onEvent?: (event: ServerSentEvent) => void;
  onError?: (error: Event) => void;
  onClose?: () => void;
}

export function streamEvents(
  url: string,
  callbacks: EventStreamCallbacks,
): AbortController {
  const controller = new AbortController();
  const source = new EventSource(url);

  source.addEventListener("message", (e) => {
    try {
      const parsed = JSON.parse(e.data) as ServerSentEvent;
      callbacks.onEvent?.(parsed);
    } catch {
      // ignore malformed events
    }
  });

  source.addEventListener("error", (e) => {
    callbacks.onError?.(e);
  });

  controller.signal.addEventListener("abort", () => {
    source.close();
    callbacks.onClose?.();
  });

  return controller;
}
