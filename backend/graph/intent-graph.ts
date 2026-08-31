import type { ConversationSnapshot } from "../intent/types.js";

/**
 * Project the Intent Collection flow graph.
 *
 * Shows the chat → intent → merge → required-info-check → clarification/prompt
 * flow.  This is support metadata before the canonical workflow begins at
 * Prompt(id).
 */
export function projectIntentGraph(c?: ConversationSnapshot) {
  const ready = Boolean(c?.intent.ready_for_prompt);
  const turns = c?.turns.length ?? 0;

  return {
    graph_id: "oneshot-intent-collection-v1",
    authority: "support-before-Prompt(id)",
    nodes: [
      {
        id: "chat",
        label: "Chat / User Turns",
        state: turns ? "COMPLETE" : "PENDING",
      },
      {
        id: "intent",
        label: "Intent Collector",
        state: turns ? "COMPLETE" : "PENDING",
      },
      {
        id: "merge",
        label: "Multi-turn Merge + Provenance",
        state: turns ? "COMPLETE" : "PENDING",
      },
      {
        id: "required-info",
        label: "Required Information Check",
        state: turns ? "COMPLETE" : "PENDING",
      },
      {
        id: "clarification",
        label: "Targeted Help Request",
        state: turns && !ready ? "RUNNING" : "PENDING",
      },
      {
        id: "prompt",
        label: "Prompt(id) Generator",
        state: ready ? "COMPLETE" : "PENDING",
      },
    ],
    edges: [
      { from: "chat", to: "intent" },
      { from: "intent", to: "merge" },
      { from: "merge", to: "required-info" },
      { from: "required-info", to: "clarification", condition: "information missing" },
      { from: "required-info", to: "prompt", condition: "sufficient" },
    ],
  };
}
