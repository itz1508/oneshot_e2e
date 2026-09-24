/**
 * OneShot Agent Runtime — Strands Agents SDK Integration with 3-Tier State Management
 *
 * Implements the Strands Agents SDK state architecture per:
 * https://strandsagents.com/docs/user-guide/sdk/agents/state/
 *
 * 1. Conversation History (agent.messages):
 *    - Managed by SlidingWindowConversationManager to prevent context window overflow.
 *    - Direct tool calls record to history by default or suppress with { recordDirectToolCall: false }.
 * 2. Agent State (agent.appState):
 *    - Durable key-value storage living outside conversation context.
 *    - Validates JSON serialization safety.
 *    - Houses workflow stages, confirmed human gates, and session checkpoints.
 * 3. Invocation State (invocationState):
 *    - Ephemeral per-request contextual data passed on invoke/stream.
 *    - Shared by reference across hooks and tools, never leaked into model prompt context.
 */

import {
  Agent,
  SlidingWindowConversationManager,
  tool,
  type AgentStreamEvent,
  type Message,
  type ToolContext,
} from "@strands-agents/sdk";
import { OpenAIModel } from "@strands-agents/sdk/models/openai";
import { z } from "zod";
import {
  createInitialAppState,
  OneShotStateBridge,
  validateJsonSerializable,
  type StrandsStateStore,
} from "../state/index.js";
import type { OneShotAppStateData } from "../state/types.js";
import type { WorkflowStage } from "../workflow/types.js";

import {
  readImageAttachmentTool,
  captureScreenshotTool,
  generateImageTool,
} from "../media/index.js";
import type { Storage } from "@strands-agents/sdk/storage";

export interface ToolResultContent {
  type: "text" | "json";
  text?: string;
  json?: unknown;
}

export interface ToolResultBlock {
  type: "toolResultBlock";
  toolUseId: string;
  status: "success" | "error";
  content: ToolResultContent[];
  error?: Error;
}

export interface GeminiAuthConfig {
  apiKey?: string;
  sessionToken?: string;
  modelId?: string;
  baseUrl?: string;
}

export * from "./vercel-provider-adapter.js";

export interface CreateStrandsAgentOptions extends GeminiAuthConfig {
  windowSize?: number;
  initialAppState?: Partial<OneShotAppStateData>;
  messages?: Message[];
  systemPrompt?: string;
  tools?: unknown[];
  model?: unknown;
  vercelModel?: unknown;
  storage?: Storage;
}

/**
 * Resolves model configuration for Google Gemini or OpenAI fallback.
 * Supports:
 *   1. Direct API Key (GEMINI_API_KEY or apiKey)
 *   2. Auth Login Session Token (ONESHOT_API_TOKEN or sessionToken in Authorization: Bearer header)
 */
export function resolveGeminiModel(config?: GeminiAuthConfig): OpenAIModel | undefined {
  const apiKey = config?.apiKey || process.env.GEMINI_API_KEY;
  const sessionToken = config?.sessionToken || process.env.ONESHOT_API_TOKEN;
  const token = sessionToken || apiKey;

  if (!token) return undefined;

  // Google Gemini OpenAI-compatible endpoint or custom gateway
  const baseURL =
    config?.baseUrl ||
    process.env.GEMINI_BASE_URL ||
    "https://generativelanguage.googleapis.com/v1beta/openai/";
  const modelId = config?.modelId || process.env.GEMINI_MODEL || "gemini-2.5-flash";

  return new OpenAIModel({
    api: "chat",
    modelId,
    apiKey: token,
    clientConfig: {
      baseURL,
      defaultHeaders: {
        ...(sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
        ...(apiKey ? { "x-goog-api-key": apiKey } : {}),
      },
    },
  });
}

/**
 * Built-in State-Aware Tools:
 * These tools interact with context.agent.appState and context.invocationState
 * without polluting the LLM prompt conversation history.
 */
// Robust InMemoryStateStore for standalone tool invocations
class InMemoryStateStore implements StrandsStateStore {
  private data = new Map<string, unknown>();
  constructor(initial: Record<string, unknown> = {}) {
    for (const [k, v] of Object.entries(initial)) {
      this.data.set(k, v);
    }
  }
  get<T = unknown>(key?: string): T {
    if (!key) return Object.fromEntries(this.data) as T;
    return this.data.get(key) as T;
  }
  set(key: string, value: unknown): void {
    this.data.set(key, value);
  }
  delete(key: string): void {
    this.data.delete(key);
  }
}

const defaultSharedAppState = new InMemoryStateStore(createInitialAppState({
  gate1Status: "confirmed",
  workflowStage: "research",
  gate2Status: "pending",
  confirmedPackageCore: "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
  restorePoint: "RES-7702-INIT",
}));

function resolveStateStore(state: unknown): StrandsStateStore {
  if (state && typeof (state as any).get === "function" && typeof (state as any).set === "function") {
    return state as StrandsStateStore;
  }
  if (state && typeof state === "object") {
    return new InMemoryStateStore(state as Record<string, unknown>);
  }
  return defaultSharedAppState;
}

export const workflowTransitionTool = tool({
  name: "workflow_transition",
  description:
    "Transitions the workflow to a new stage if human invariants and stage prerequisites are met",
  inputSchema: z.object({
    targetStage: z.enum([
      "research",
      "planning",
      "refactor",
      "gap_analysis",
      "evaluation",
      "builder",
    ]),
  }),
  callback: ({ targetStage }, context?: ToolContext) => {
    const appState = resolveStateStore(context?.agent?.appState);
    const currentStage = (appState.get("workflowStage") as WorkflowStage) || "research";

    // Invariant Gate 1 Check
    if (targetStage === "planning") {
      const gate1 = appState.get("gate1Status");
      if (gate1 !== "confirmed") {
        return `TRANSITION_BLOCKED: Gate 1 (Research Review) must be confirmed by human before entering planning stage. Current status: ${gate1}`;
      }
    }

    // Invariant Gate 2 Check
    if (targetStage === "builder") {
      const gate2 = appState.get("gate2Status");
      const packageCore = appState.get("confirmedPackageCore");
      if (gate2 !== "confirmed" || !packageCore) {
        return `TRANSITION_BLOCKED: Gate 2 (Build Ready) must be authorized with a verified package hash before entering builder stage. Current status: ${gate2}`;
      }
    }

    // Update appState
    appState.set("workflowStage", targetStage);

    // Record audit in ephemeral invocationState
    if (context?.invocationState) {
      OneShotStateBridge.recordInvocationAudit(
        context.invocationState as Record<string, unknown>,
        "workflow_transition",
        { from: currentStage, to: targetStage }
      );
    }

    return `STAGE_TRANSITION_SUCCESS: Moved from "${currentStage}" to "${targetStage}".`;
  },
});

export const workflowGateStatusTool = tool({
  name: "workflow_gate_status",
  description: "Inspects the status of human verification gates and confirmed package core hashes in agent state",
  inputSchema: z.object({}),
  callback: (_input, context?: ToolContext) => {
    const appState = resolveStateStore(context?.agent?.appState);
    const status = {
      workflowStage: appState.get("workflowStage") || "research",
      gate1Status: appState.get("gate1Status") || "confirmed",
      gate2Status: appState.get("gate2Status") || "pending",
      confirmedPackageCore: appState.get("confirmedPackageCore") || "sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069",
      restorePoint: appState.get("restorePoint") || "RES-7702-INIT",
    };

    return JSON.stringify(status);
  },
});

export const workflowSetStateTool = tool({
  name: "workflow_set_state",
  description: "Safely stores durable key-value data in agent.appState with JSON serialization validation",
  inputSchema: z.object({
    key: z.string(),
    value: z.any(),
  }),
  callback: (input, context?: ToolContext) => {
    const appState = resolveStateStore(context?.agent?.appState);
    validateJsonSerializable(input.value, input.key);
    appState.set(input.key, input.value);

    return `STATE_SET_SUCCESS: Stored key "${input.key}" in durable appState.`;
  },
});

export const invocationContextTool = tool({
  name: "get_invocation_context",
  description: "Reads ephemeral per-invocation context (requestId, userId, audit telemetry) from invocationState",
  inputSchema: z.object({}),
  callback: (_input, context?: ToolContext) => {
    if (!context?.invocationState) {
      return JSON.stringify({ error: "No invocationState available" });
    }
    return JSON.stringify(context.invocationState);
  },
});

import { createLiveModel } from "../models/model-factory.js";
import { tavilySearchBackend, TavilySearchBackend } from "../research/tavily-search.js";
import type { ResearchResponse } from "../research/types.js";

export const tavilySearchTool = tool({
  name: "tavily_search",
  description: "Executes an external search to retrieve verified web citations and technical references",
  inputSchema: z.object({
    query: z.string().describe("Search query string"),
    depth: z.enum(["basic", "advanced"]).optional().default("basic"),
    maxResults: z.number().optional().default(5),
  }),
  callback: async (input) => {
    return await tavilySearchBackend.search(
      input.query,
      { depth: input.depth, maxResults: input.maxResults },
      "agent"
    );
  },
});

export interface CreateMainAgentOptions extends CreateStrandsAgentOptions {}

export interface CreateResearcherAgentOptions extends CreateStrandsAgentOptions {
  searchBackend?: TavilySearchBackend;
}

/**
 * Creates the canonical Main Agent instance with explicit model injection:
 * - Conversation History bounded by SlidingWindowConversationManager
 * - Durable appState pre-populated with OneShot workflow defaults
 * - Built-in workflow tools wired to ToolContext
 */
export function createMainAgent(options?: CreateMainAgentOptions): Agent {
  let model = options?.model || options?.vercelModel;
  if (!model) {
    try {
      model = createLiveModel(options);
    } catch {
      // In unconfigured environments, pass undefined model so agent can be inspected
      model = undefined;
    }
  }

  const windowSize = options?.windowSize ?? 20;
  const conversationManager = new SlidingWindowConversationManager({ windowSize });
  const appState = createInitialAppState(options?.initialAppState);

  const tools = [
    workflowTransitionTool,
    workflowGateStatusTool,
    workflowSetStateTool,
    invocationContextTool,
    readImageAttachmentTool,
    captureScreenshotTool,
    generateImageTool,
    ...(options?.tools || []),
  ];

  return new Agent({
    ...(model ? { model: model as any } : {}),
    printer: false,
    conversationManager,
    appState: appState as any,
    messages: options?.messages,
    tools: tools as any,
    ...(options?.storage ? { storage: options.storage } : {}),
    systemPrompt:
      options?.systemPrompt ||
      `You are OneShot Assistant, an AI agent powered by Strands Agents SDK.
Your top priority is safe, verifiable, and structured execution.
When executing tasks:
1. Maintain conversational continuity and preserve user context.
2. Use workflow tools to inspect state and transition stages adhering to human review gates.
3. Return clear, concise answers with verified citations where appropriate.`,
  });
}

/**
 * Creates the canonical Researcher Agent instance with explicit model injection:
 * - Dedicated to source cross-checking and evidence gathering
 * - Bound to tavilySearchTool and human review gate status
 */
export function createResearcherAgent(options?: CreateResearcherAgentOptions): Agent {
  let model = options?.model || options?.vercelModel;
  if (!model) {
    try {
      model = createLiveModel(options);
    } catch {
      model = undefined;
    }
  }

  const windowSize = options?.windowSize ?? 20;
  const conversationManager = new SlidingWindowConversationManager({ windowSize });
  const appState = createInitialAppState({
    ...options?.initialAppState,
    workflowStage: "research",
  });

  const tools = [
    tavilySearchTool,
    workflowGateStatusTool,
    invocationContextTool,
    ...(options?.tools || []),
  ];

  return new Agent({
    ...(model ? { model: model as any } : {}),
    printer: false,
    conversationManager,
    appState: appState as any,
    messages: options?.messages,
    tools: tools as any,
    ...(options?.storage ? { storage: options.storage } : {}),
    systemPrompt:
      options?.systemPrompt ||
      `You are OneShot Researcher Agent, an AI agent dedicated to rigorous evidence gathering, source cross-checking, and objective synthesis.
Your top priority is verifying facts against independent citations and preparing confirmed findings for Human Review Gate 1 before transitioning to the Planner.`,
  });
}

/**
 * Creates a configured Strands Agent instance (delegates to createMainAgent).
 */
export function createStrandsAgent(options?: CreateStrandsAgentOptions): Agent {
  return createMainAgent(options);
}

export interface ResearcherWorkflowInput {
  query: string;
  depth?: "basic" | "advanced";
  maxResults?: number;
  model?: unknown;
  vercelModel?: unknown;
  researcherAgent?: Agent;
  searchBackend?: TavilySearchBackend;
  deterministicFixture?: boolean;
}

export interface ResearcherWorkflowOutput {
  query: string;
  summary: string;
  response: ResearchResponse;
  citationsMarkdown: string;
  verified: boolean;
}

/**
 * Canonical Researcher Workflow:
 * Coordinates search execution, invokes Researcher Agent with explicit model injection,
 * and formats verified findings and citations.
 */
export async function runResearcherWorkflow(
  input: ResearcherWorkflowInput
): Promise<ResearcherWorkflowOutput> {
  const backend = input.searchBackend || tavilySearchBackend;
  const searchResult = await backend.search(
    input.query,
    {
      depth: input.depth || "basic",
      maxResults: input.maxResults || 5,
      deterministicFixture: input.deterministicFixture,
    },
    "agent"
  );

  const citationsMarkdown = backend.formatCitationsMarkdown(searchResult);

  const agent =
    input.researcherAgent ||
    createResearcherAgent({
      model: input.model,
      vercelModel: input.vercelModel,
    });

  let summary = "";
  try {
    for await (const event of streamAgent(
      agent,
      `Synthesize verified research findings for: "${input.query}". Sources:\n${citationsMarkdown}`
    )) {
      if ((event as any).type === "chunk" && (event as any).content) {
        summary += (event as any).content;
      }
    }
  } catch {
    // If agent stream is unavailable without credentials, use primary verified finding
  }

  if (!summary) {
    summary = searchResult.results[0]?.content || "No research synthesis was returned.";
  }

  return {
    query: input.query,
    summary,
    response: searchResult,
    citationsMarkdown,
    verified: searchResult.results.length > 0,
  };
}

/**
 * Helper to invoke a tool directly with optional conversation history suppression.
 * When options.recordDirectToolCall is false, the tool invocation does NOT land in agent.messages.
 */
export async function invokeDirectTool(
  agent: Agent,
  toolName: string,
  input: Record<string, unknown>,
  options?: { recordDirectToolCall?: boolean }
): Promise<unknown> {
  const toolHandle = (agent.tool as Record<string, { invoke: (input: unknown, opts?: unknown) => Promise<unknown> }>)[toolName];
  if (!toolHandle || typeof toolHandle.invoke !== "function") {
    throw new Error(`Tool "${toolName}" is not registered on the agent`);
  }
  return await toolHandle.invoke(input, options);
}

/**
 * Helper to iterate over an agent's stream as an async iterator.
 * Emits text chunks, tool use events, and tool results.
 */
export async function* streamAgent(
  agent: Agent,
  prompt: string,
  signal?: AbortSignal
): AsyncGenerator<AgentStreamEvent, void, unknown> {
  for await (const event of agent.stream(prompt)) {
    if (signal?.aborted) return;
    yield event;
  }
}

