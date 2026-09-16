export type IntegrationCategory =
  | "model_provider"
  | "tool"
  | "session_manager"
  | "memory_store"
  | "storage"
  | "integration"
  | "plugin"
  | "agent_extension"
  | "intervention";

export type SupportState = "available" | "supported" | "unsupported" | "planned";

export const CATEGORY_LABELS: Record<IntegrationCategory, string> = {
  model_provider: "Model providers",
  tool: "Tools",
  session_manager: "Session managers",
  memory_store: "Memory stores",
  storage: "Storage",
  integration: "Integrations",
  plugin: "Plugins",
  agent_extension: "Agent extensions",
  intervention: "Interventions",
};

export const SUPPORT_LABELS: Record<SupportState, string> = {
  available: "Available",
  supported: "Supported",
  unsupported: "Unsupported",
  planned: "Planned",
};

export interface IntegrationEntry {
  id: string;
  name: string;
  category: IntegrationCategory;
  support: SupportState;
  description: string;
}

export const INTEGRATIONS_SEED: IntegrationEntry[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "model_provider",
    support: "supported",
    description: "GPT-4o / o1 via API key.",
  },
  {
    id: "anthropic",
    name: "Anthropic",
    category: "model_provider",
    support: "supported",
    description: "Claude 3.5 Sonnet via API key.",
  },
  {
    id: "tavily",
    name: "Tavily",
    category: "tool",
    support: "supported",
    description: "Web search and hybrid research.",
  },
  {
    id: "strands-cosmos",
    name: "Strands Cosmos",
    category: "agent_extension",
    support: "supported",
    description: "Video understanding and cosmos skill.",
  },
  {
    id: "mongodb",
    name: "MongoDB Atlas",
    category: "memory_store",
    support: "planned",
    description: "Persistent session storage.",
  },
];
