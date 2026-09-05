/**
 * workflow-trace — persistent canonical workflow trace store.
 *
 * Keeps completed workflow events inspectable after terminal state without
 * replacing the main user-facing result. Session-scoped persistence is
 * best-effort; runtime events remain in memory if storage is unavailable.
 * Ported from ui-e2e-observability 0e78233 (web/src/agent/workflowTrace.ts).
 */
const STORAGE_KEY = 'oneshot.workflow-trace.v1';
const listeners = new Set();

function loadInitial() {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

let snapshot = loadInitial();

function persist() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Session persistence is best-effort; runtime events remain in memory.
  }
}

function notify() {
  for (const listener of listeners) listener();
}

function publish(next) {
  snapshot = [...next].sort((a, b) => a.sequence - b.sequence);
  persist();
  notify();
}

export const workflowTraceStore = {
  getSnapshot() {
    return snapshot;
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  reset() {
    publish([]);
  },

  record(entry) {
    if (snapshot.some((current) => current.eventId === entry.eventId)) return;
    publish([...snapshot, entry]);
  },

  enrich(eventId, details) {
    let changed = false;
    const next = snapshot.map((entry) => {
      if (entry.eventId !== eventId) return entry;
      changed = true;
      return { ...entry, details: { ...entry.details, ...details } };
    });
    if (changed) publish(next);
  },
};