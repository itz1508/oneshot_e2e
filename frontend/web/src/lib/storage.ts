import { Session, EarlierContextItem } from "../types";

export const INITIAL_EARLIER_CONTEXT: EarlierContextItem[] = [
  {
    id: "ctx-ui-001",
    title: "Google Agent Framework (ADK) State Machine",
    source: "Autonomous multi-agent lifecycle: Researcher -> Planner -> Builder -> Validator with deterministic state transitions.",
    category: "ADK Runtime",
    date: "2026-09-24",
    time: "11:40",
    agent: "WorkflowCoordinator",
    restoreId: "restore-ui-001",
  },
  {
    id: "ctx-memory-002",
    title: "Gemini 3.5 Flash Streaming & Gateway Fallback",
    source: "Zero-stall token streaming and automated gateway fallback across Google Gemini, OpenAI, and Ollama providers.",
    category: "DeepAgents",
    date: "2026-09-24",
    time: "10:15",
    agent: "StreamingGateway",
    restoreId: "restore-memory-002",
  },
  {
    id: "ctx-research-003",
    title: "Cloud Run Containerization & Verification Gates",
    source: "Single-step multi-stage Docker build, OpenTelemetry tracing, and cryptographic manifest verification.",
    category: "Cloud Run",
    date: "2026-09-24",
    time: "09:30",
    agent: "DeployValidator",
    restoreId: "restore-research-003",
  },
];

export const INITIAL_SESSIONS: Session[] = [
  {
    id: "session-101",
    title: "OneShot Enterprise Fleet Architecture",
    timestamp: "11:42",
    dateGroup: "Today",
    earlierContext: INITIAL_EARLIER_CONTEXT,
    messages: [
      {
        id: "m-1",
        role: "assistant",
        timestamp: "11:43",
        content: `### OneShot Autonomous Software Engineering Fleet

**System Online & Ready** — Powered by the Google Agent Development Kit (ADK) workflow engine, Gemini 3.5 Flash streaming, DeepAgents real-time event protocol, and Google Cloud Run.

* **Multi-Agent SOP Engine:** Coordinated \`Researcher\` → \`Planner\` → \`Builder\` → \`Validator\` agents with deterministic transitions and private tool bindings.
* **DeepAgents Event Standard:** Native token deltas (\`stream.messages\`), delegated agent events (\`stream.subagents\`), lifecycle tool executions (\`stream.tool_calls\`), and reactive task state (\`stream.values.todos\`).
* **Human-in-the-Loop Governance:** Enforces **Gate 1** (Research Review) and **Gate 2** (Package Core Hash) before autonomous code modification.
* **Resilient Multi-Provider Integration:** Ultra-fast local Python Reasoner with automated gateway failover across Google Gemini, OpenAI, and local LLMs.

Choose a starter action below or enter a prompt to begin autonomous execution.`,
        citations: [
          { id: "c-1", num: 1, title: "Google Gemini 3.5 Flash", subtitle: "Multi-modal streaming & gateway fallbacks" },
          { id: "c-2", num: 2, title: "Google ADK Workflow", subtitle: "Deterministic stage machine & human gates" },
          { id: "c-3", num: 3, title: "Google Cloud Run Ready", subtitle: "Containerized deployment & OTel telemetry" },
        ],
      },
    ],
  },
  {
    id: "session-100",
    title: "DeepAgents Reactive Todo Pipeline",
    timestamp: "10:18",
    dateGroup: "Today",
    messages: [],
  },
  {
    id: "session-099",
    title: "Deterministic Manifest Verification",
    timestamp: "09:51",
    dateGroup: "Today",
    messages: [],
  },
  {
    id: "session-094",
    title: "Cloud Run Multi-Stage Docker Spec",
    timestamp: "Yesterday",
    dateGroup: "Yesterday",
    messages: [],
  },
  {
    id: "session-090",
    title: "Gate 1 Spec Review & Gate 2 Deployment",
    timestamp: "Yesterday",
    dateGroup: "Yesterday",
    messages: [],
  },
  {
    id: "session-084",
    title: "Gemini 3.5 Flash Provider Benchmark",
    timestamp: "Sep 9",
    dateGroup: "Previous",
    messages: [],
  },
  {
    id: "session-079",
    title: "Builder Reference Structure",
    timestamp: "Sep 8",
    dateGroup: "Previous",
    messages: [],
  },
];

const SESSIONS_STORAGE_KEY = "oneshot_sessions_v2";
const ACTIVE_SESSION_STORAGE_KEY = "oneshot_active_session_id_v2";

export function loadStoredSessions(): Session[] {
  if (typeof window === "undefined") return INITIAL_SESSIONS;
  try {
    const raw = localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return INITIAL_SESSIONS;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return INITIAL_SESSIONS;
    const hasLegacy = parsed.some(
      (s: any) =>
        s?.title?.includes("Tokyo") ||
        s?.title?.includes("Conversation collapse") ||
        s?.messages?.some((m: any) => m?.content?.includes("Tokyo"))
    );
    if (hasLegacy) return INITIAL_SESSIONS;
    return parsed;
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
