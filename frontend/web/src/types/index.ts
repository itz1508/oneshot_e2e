export type Role = "user" | "assistant" | "system";

export interface Citation {
  id: string;
  num: number;
  title: string;
  subtitle?: string;
  url?: string;
}

export interface ActivityStep {
  id: string;
  label: string;
  status: "pending" | "in_progress" | "completed" | "failed";
  meta?: string;
}

export interface ActivityState {
  isRunning: boolean;
  title: string;
  steps: ActivityStep[];
  startTime?: number;
}

export interface ToolCallState {
  callId: string;
  name: string;
  args?: Record<string, unknown> | string;
  status: "running" | "finished" | "error";
  result?: unknown;
  error?: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  timestamp: string;
  citations?: Citation[];
  activity?: ActivityState;
  isStreaming?: boolean;
  toolCalls?: ToolCallState[];
}

export interface EarlierContextItem {
  id: string;
  title: string;
  source: string;
  category: string;
  date: string;
  time: string;
  agent: string;
  restoreId: string;
}

export type ProviderId = "gemini" | "openai" | "nebius";

export interface ProviderConfig {
  key: string;
  model: string;
  baseUrl: string;
  temperature: string;
  configured: boolean;
}

export interface ProviderDefinition {
  id: ProviderId;
  name: string;
  sub: string;
  badge?: string;
  dotGradient: string;
  models: string[];
  baseUrl: string;
  modelHelp: string;
  keyHelp: string;
  note: string;
}

export interface Session {
  id: string;
  title: string;
  timestamp: string;
  dateGroup: "Today" | "Yesterday" | "Previous";
  messages: Message[];
  earlierContext?: EarlierContextItem[];
}
