import { Session, EarlierContextItem } from "../types";

export const INITIAL_EARLIER_CONTEXT: EarlierContextItem[] = [
  {
    id: "ctx-ui-001",
    title: "Frontend and backend direction",
    source: "Keep the interface familiar while deeper processing happens behind the conversation.",
    category: "UX/UI",
    date: "2026-09-11",
    time: "10:42",
    agent: "Researcher-A",
    restoreId: "restore-ui-001",
  },
  {
    id: "ctx-memory-002",
    title: "Keeping earlier context available",
    source: "Hide older discussion from the main flow without losing the original conversation context.",
    category: "Memory",
    date: "2026-09-11",
    time: "10:18",
    agent: "Memory-Agent",
    restoreId: "restore-memory-002",
  },
  {
    id: "ctx-research-003",
    title: "Research validation approach",
    source: "Check important findings and cross-verify with independent sources before presenting the final result.",
    category: "Research",
    date: "2026-09-11",
    time: "09:54",
    agent: "Validator",
    restoreId: "restore-research-003",
  },
];

export const INITIAL_SESSIONS: Session[] = [
  {
    id: "session-101",
    title: "Conversation collapse behavior",
    timestamp: "11:42",
    dateGroup: "Today",
    earlierContext: INITIAL_EARLIER_CONTEXT,
    messages: [
      {
        id: "m-1",
        role: "assistant",
        timestamp: "11:43",
        content: `### Tokyo plan, validated against your existing preferences

Based on the preferences already established in this conversation, the strongest approach is to keep one hotel base and group each day by neighborhood rather than crossing the city repeatedly.

* **Day 1:** Arrival, easy neighborhood walk, early dinner in Shinjuku.
* **Day 2:** West Tokyo cluster (Shibuya, Harajuku, Meiji Shrine) with minimal transit backtracking.
* **Day 3:** Central and East Tokyo cluster (Ginza, Asakusa, Ueno) and evening activity.
* **Day 4:** Flexible day for high-priority day trips (Hakone or Kamakura).
* **Day 5:** Light final morning near the departure route.

Current details that matter to booking or opening hours should come from external sources only when needed; the rest of the answer can continue from the conversation without restarting the research context.`,
        citations: [
          { id: "c-1", num: 1, title: "Official source", subtitle: "Primary validation" },
          { id: "c-2", num: 2, title: "Independent cross-check", subtitle: "Transit & timing" },
          { id: "c-3", num: 3, title: "Supporting reference", subtitle: "Context confirmation" },
        ],
      },
    ],
  },
  {
    id: "session-100",
    title: "Research validation flow",
    timestamp: "10:18",
    dateGroup: "Today",
    messages: [],
  },
  {
    id: "session-099",
    title: "Ephemeral progress display",
    timestamp: "09:51",
    dateGroup: "Today",
    messages: [],
  },
  {
    id: "session-094",
    title: "External search context reuse",
    timestamp: "Yesterday",
    dateGroup: "Yesterday",
    messages: [],
  },
  {
    id: "session-090",
    title: "Chat-first layout direction",
    timestamp: "Yesterday",
    dateGroup: "Yesterday",
    messages: [],
  },
  {
    id: "session-084",
    title: "Integration provider setup",
    timestamp: "Sep 9",
    dateGroup: "Previous",
    messages: [],
  },
  {
    id: "session-079",
    title: "Builder reference structure",
    timestamp: "Sep 8",
    dateGroup: "Previous",
    messages: [],
  },
];

const SESSIONS_STORAGE_KEY = "oneshot_sessions_v1";
const ACTIVE_SESSION_STORAGE_KEY = "oneshot_active_session_id_v1";

export function loadStoredSessions(): Session[] {
  if (typeof window === "undefined") return INITIAL_SESSIONS;
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return INITIAL_SESSIONS;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_SESSIONS;
  } catch {
    return INITIAL_SESSIONS;
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
  if (typeof window === "undefined") return "session-101";
  return localStorage.getItem(ACTIVE_SESSION_STORAGE_KEY) || "session-101";
}

export function setActiveSessionId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_SESSION_STORAGE_KEY, id);
}
