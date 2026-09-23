/**
 * OneShot Multi-Agent Handoffs Module
 *
 * Implements tool-driven state transitions, paired messages, and human gate verification per:
 * https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs
 */

export type * from "./types.js";
export * from "./handoff-tools.js";
export * from "./supervisor.js";
