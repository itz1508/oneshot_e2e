import { Session } from "../types";

const SESSIONS_STORAGE_KEY = "oneshot_sessions_v3";
const ACTIVE_SESSION_STORAGE_KEY = "oneshot_active_session_id_v3";

function createEmptySession(): Session {
  return {
    id: `session-${Date.now()}`,
    title: "New chat",
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    dateGroup: "Today",
    messages: [],
    earlierContext: [],
  };
}

export function loadStoredSessions(): Session[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [createEmptySession()];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return [createEmptySession()];
    return parsed;
  } catch {
    return [createEmptySession()];
  }
}

export function saveStoredSessions(sessions: Session[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.error("Failed to save sessions", err);
  }
}

export function getActiveSessionId(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || "";
}

export function setActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
}
