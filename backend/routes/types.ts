import type http from "node:http";
import type {
  OneShotWorkflowEngine,
  SessionLedger,
  TodoChainManager,
  GitLocalStorage,
} from "../../packages/agent-runtime/src/index.js";

export interface ProviderConfig {
  provider: "gemini" | "openai" | "nebius" | "mistral" | "ollama" | "tavily";
  apiKey?: string;
  model?: string;
  baseUrl?: string;
}

export interface RouteContext {
  reqUrl: URL;
  pathname: string;
  workflowEngine: OneShotWorkflowEngine;
  sessionLedger: SessionLedger;
  todoManager: TodoChainManager;
  gitStorage: GitLocalStorage;
  providerConfigs: Map<string, ProviderConfig>;
  sessions: Map<string, { id: string; title: string; messages: unknown[] }>;
  isConfiguredKey: (key?: string) => boolean;
  validateRealFixture: (params: {
    fixture_id?: string;
    sessionId?: string;
    path?: string;
    expectedHash?: string;
  }) => Promise<any>;
  parseBody: (req: http.IncomingMessage) => Promise<any>;
  getSessionProvider: (sessionId: string) => ProviderConfig;
  getProviderRegistry: () => any;
  port: number;
  config?: any;
  requestId?: string;
}

export type RouteHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ctx: RouteContext
) => Promise<boolean>;
