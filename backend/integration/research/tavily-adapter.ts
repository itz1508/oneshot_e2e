import type { ResearchProviderDefinition } from "./registry.js";

/**
 * Tavily research provider descriptor. The actual search/extract logic lives
 * in `backend/agents/researcher/tool/tavily/bridge.ts` and is wired through
 * OneShot research policy in M12. This descriptor is external-call-free and
 * carries no credentials.
 */
export const tavilyResearchProvider: ResearchProviderDefinition = {
  providerId: "tavily",
  displayName: "Tavily",
  requiresAuth: true,
};
