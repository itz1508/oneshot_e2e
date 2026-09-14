#!/usr/bin/env node
/**
 * CLI helper to activate or deactivate a skill for a conversation.
 *
 * Usage:
 *   node scripts/skills/activate-skill.mjs --skill strands-cosmos --conversation conv-1 --groups vision,generate
 *   node scripts/skills/activate-skill.mjs --skill strands-cosmos --conversation conv-1 --deactivate
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    skill: { type: "string", short: "s" },
    conversation: { type: "string", short: "c" },
    groups: { type: "string", short: "g" },
    deactivate: { type: "boolean", short: "d", default: false },
    baseUrl: { type: "string", default: "http://localhost:8787" },
  },
});

if (!values.skill || !values.conversation) {
  console.error("--skill and --conversation are required");
  process.exit(1);
}

const path = values.deactivate
  ? `/api/skills/${encodeURIComponent(values.skill)}/deactivate`
  : `/api/skills/${encodeURIComponent(values.skill)}/activate`;

const body = values.deactivate
  ? { conversationId: values.conversation }
  : {
      conversationId: values.conversation,
      groups: (values.groups || "").split(",").map((g) => g.trim()).filter(Boolean),
    };

const response = await fetch(`${values.baseUrl}${path}`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const data = await response.json().catch(() => ({}));
console.log(response.status, data);
