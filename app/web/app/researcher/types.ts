export type ResearchStyle = "fast" | "balanced" | "deep";

export type RunPhase =
  | "idle"
  | "starting"
  | "searching"
  | "reading"
  | "writing"
  | "done"
  | "error"
  | "interrupted";

export interface SourceDoc {
  index: number;
  url: string;
  title?: string;
  snippet?: string;
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input?: unknown;
  status: "running" | "done" | "error";
  progress?: string;
  outputSummary?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: number;
  sources?: SourceDoc[];
  toolCalls?: ToolCallRecord[];
  usage?: unknown;
  durationSec?: number;
  interrupted?: boolean;
}

export interface RuntimeError {
  code: string;
  message: string;
  action?: string;
}

export interface ProviderSettings {
  runtimeMode: "browser" | "python";
  remoteBaseUrl?: string;
  researchStyle: ResearchStyle;
  provider?: string;
  apiKey?: string;
  tavilyApiKey?: string;
  // Provider-specific keys can be added here.
  [key: string]: string | undefined | unknown;
}

export interface SessionMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  agentId: string;
  runtimeMode: ProviderSettings["runtimeMode"];
}
