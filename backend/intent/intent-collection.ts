import { randomUUID } from "node:crypto";
import type { Prompt, RootCause } from "../contracts/schema/types.js";
import type {
  ConversationSnapshot,
  ConversationTurn,
  HelpRequest,
  IntentState,
  IntentStatement,
  PromptCreationResult,
} from "./types.js";
import { ConversationStore } from "./conversation-store.js";

// ---------------------------------------------------------------------------
// Semantic intent extraction — recognizes natural user requests and derives
// actionable goals and requested outcomes without requiring rigid keywords.
// ---------------------------------------------------------------------------

/** Matches isolated vague/generic requests that lack a resolvable target. */
const VAGUE_GENERIC =
  /^(?:i\s+want\s+to\s+)?(?:build|create|make|do|fix|run|test|work\s+on)\s+(?:something|it|this|that|an?\s+app|an?\s+system|an?\s+application)\.?$/i;

const VAGUE_PHRASES =
  /^(?:hello|hi|hey|help|help\s+me|start|go|ok|okay|please|test|run|build\s+it|fix\s+it|do\s+it|make\s+it)\.?$/i;

/** Matches language that indicates a requirement statement. */
const REQ =
  /\b(must|need|needs|should|support|include|feature|require|required|allow|handle|provide)\b/i;

/** Matches language that indicates a constraint statement. */
const CONSTRAINT =
  /\b(only|limit|budget|timeline|deadline|latency|throughput|performance|scale|concurrent|within|prefer|local|offline|security|compliance)\b/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clean(v: string): string {
  return v
    .replace(/^[\s>*#\-\d.)]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function lines(message: string): string[] {
  return message
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map(clean)
    .filter(Boolean);
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((x) => x.trim()).filter(Boolean))];
}

function isInsufficientIntent(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  if (VAGUE_GENERIC.test(trimmed) || VAGUE_PHRASES.test(trimmed)) return true;
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2 && /^(?:build|make|fix|create|do)\s+(?:it|this|that)$/i.test(trimmed)) {
    return true;
  }
  return false;
}

function deriveGoalAndOutcome(
  parts: string[],
  fullMessage: string,
): { goal?: string; requested_outcome?: string } {
  if (isInsufficientIntent(fullMessage)) {
    return {};
  }

  const cleanMessage = clean(fullMessage);
  const firstPart = parts[0] || cleanMessage;
  const goal = firstPart.replace(/[.!?]+$/, "");

  let outcome: string | undefined;
  if (parts.length > 1) {
    outcome = parts.slice(1).join("; ");
  } else {
    const outcomeMatch = fullMessage.match(
      /(?:and\s+(?:give|provide|show|produce|generate|create)\s+(?:me\s+)?|to\s+produce\s+|yielding\s+)(.+)/i,
    );
    if (outcomeMatch && outcomeMatch[1]) {
      outcome = outcomeMatch[1].trim().replace(/[.!?]+$/, "");
    } else {
      outcome = goal;
    }
  }

  return { goal, requested_outcome: outcome || goal };
}

function statement(
  kind: IntentStatement["kind"],
  value: string,
  turnId: string,
  revision: number,
  existing?: IntentStatement,
): IntentStatement {
  if (existing) {
    return {
      ...existing,
      value,
      source_turn_ids: unique([...existing.source_turn_ids, turnId]),
      revision,
    };
  }
  return {
    statement_id: `intent-statement:${randomUUID()}`,
    kind,
    value,
    source_turn_ids: [turnId],
    revision,
  };
}

// ---------------------------------------------------------------------------
// IntentCollectionService
// ---------------------------------------------------------------------------

/**
 * Converts multi-turn chat input into a traceable Intent revision and then
 * into a canonical Prompt(id) — only when required user-owned information is
 * sufficient.
 *
 * Boundaries:
 *  - Never creates plan_id.
 *  - Never invokes Planner directly.
 *  - No automatic retry/fix loops — asks the smallest targeted question.
 */
export class IntentCollectionService {
  constructor(private store: ConversationStore) {}

  /** Start a brand-new conversation with the first user message. */
  start(message: string): ConversationSnapshot {
    const conversation_id = `conversation:${randomUUID()}`;
    const session_id = `session:${randomUUID()}`;
    const now = new Date().toISOString();

    const intent: IntentState = {
      intent_id: `intent:${randomUUID()}`,
      revision: 0,
      conversation_id,
      source_turn_ids: [],
      requirements: [],
      constraints: [],
      context: [],
      statements: [],
      missing_required_information: [],
      ready_for_prompt: false,
    };

    const snap: ConversationSnapshot = {
      conversation_id,
      session_id,
      turns: [],
      intent,
      created_at: now,
      updated_at: now,
    };

    this.store.save(snap);
    return this.addTurn(conversation_id, message);
  }

  /** Add a new user turn to an existing conversation. */
  addTurn(conversationId: string, message: string): ConversationSnapshot {
    const snap = this.store.require(conversationId);

    const turn: ConversationTurn = {
      turn_id: `turn:${randomUUID()}`,
      turn_number: snap.turns.length + 1,
      user_message: message.trim(),
      created_at: new Date().toISOString(),
    };

    snap.turns.push(turn);
    snap.intent = this.merge(snap.intent, turn);
    snap.updated_at = turn.created_at;
    return this.store.save(snap);
  }

  /** Get a conversation snapshot, if it exists. */
  get(conversationId: string): ConversationSnapshot | undefined {
    return this.store.get(conversationId);
  }

  /**
   * Attempt to create a canonical Prompt(id) from the accumulated intent.
   *
   * Returns `{ result: "PASSED", prompt, intent }` when sufficient, or
   * `{ result: "ROOT_CAUSE", root_cause, help_request, intent }` when
   * user-owned information is still missing.
   */
  createPrompt(
    conversationId: string,
    promptId: string,
  ): PromptCreationResult {
    const snap = this.store.require(conversationId);
    const intent = snap.intent;

    if (!intent.ready_for_prompt) {
      const help = this.buildHelpRequest(intent);
      const rc: RootCause = {
        issue: "Additional information required",
        expected:
          "Intent contains enough user-owned information to produce Prompt(id)",
        actual: help.reason,
        evidence_ids: intent.source_turn_ids,
        required_correction: `Ask user: ${help.question}`,
        recheck_target: intent.intent_id,
      };
      return { result: "ROOT_CAUSE", root_cause: rc, help_request: help, intent };
    }

    const prompt: Prompt = {
      prompt_id: promptId,
      intent: intent.goal!,
      requested_outcome: intent.requested_outcome!,
      context: intent.context.map((x, i) => ({
        context_id: `intent-context:${intent.intent_id}:${i + 1}`,
        statement: x,
      })),
      research_direction: unique([
        "requirements",
        "dependencies",
        "success criteria",
        ...intent.requirements.slice(0, 3),
      ]),
    };

    return { result: "PASSED", prompt, intent };
  }

  // -------------------------------------------------------------------------
  // Private — intent merging
  // -------------------------------------------------------------------------

  /**
   * Merge a new conversation turn into the existing intent state.
   * Each turn increments the revision, preserves source-turn provenance,
   * and re-evaluates readiness.
   */
  private merge(previous: IntentState, turn: ConversationTurn): IntentState {
    const revision = previous.revision + 1;
    const parts = lines(turn.user_message);
    const derived = deriveGoalAndOutcome(parts, turn.user_message);

    const goal = previous.goal ?? derived.goal;

    const requirements = unique([
      ...previous.requirements,
      ...parts.filter((x) => REQ.test(x) && x !== goal),
    ]);

    const constraints = unique([
      ...previous.constraints,
      ...parts.filter((x) => CONSTRAINT.test(x) && x !== goal),
    ]);

    const context = unique([...previous.context, turn.user_message.trim()]);

    let requested_outcome =
      previous.requested_outcome ?? derived.requested_outcome;
    if (!requested_outcome && goal) requested_outcome = goal;

    // Upsert classified statements
    const byKind = new Map(previous.statements.map((x) => [x.kind, x]));
    const statements = [...previous.statements];

    const upsert = (
      kind: IntentStatement["kind"],
      value?: string,
    ): void => {
      if (!value) return;
      const old = byKind.get(kind);
      const next = statement(kind, value, turn.turn_id, revision, old);
      if (old) {
        statements[statements.indexOf(old)] = next;
      } else {
        statements.push(next);
      }
      byKind.set(kind, next);
    };

    upsert("goal", goal);
    upsert("outcome", requested_outcome);

    for (const v of requirements) {
      if (!statements.some((s) => s.kind === "requirement" && s.value === v)) {
        statements.push(statement("requirement", v, turn.turn_id, revision));
      }
    }

    for (const v of constraints) {
      if (!statements.some((s) => s.kind === "constraint" && s.value === v)) {
        statements.push(statement("constraint", v, turn.turn_id, revision));
      }
    }

    statements.push(
      statement("context", turn.user_message.trim(), turn.turn_id, revision),
    );

    const missing: string[] = [];
    if (!goal) missing.push("goal");
    if (!requested_outcome) missing.push("requested_outcome");

    return {
      ...previous,
      revision,
      source_turn_ids: unique([...previous.source_turn_ids, turn.turn_id]),
      goal,
      requested_outcome,
      requirements,
      constraints,
      context,
      statements,
      missing_required_information: missing,
      ready_for_prompt: missing.length === 0,
    };
  }

  // -------------------------------------------------------------------------
  // Private — help request generation
  // -------------------------------------------------------------------------

  private buildHelpRequest(intent: IntentState): HelpRequest {
    const field =
      intent.missing_required_information[0] ?? "requested_outcome";

    const question =
      field === "goal"
        ? "What specifically do you want OneShot to build, change, analyze, or fix?"
        : "What result should OneShot produce when this work is complete?";

    return {
      request_id: `help:${randomUUID()}`,
      reason: `Required user-owned information is missing: ${field}`,
      question,
      required_information: [field],
      source_processor: "IntentCollection",
      intent_id: intent.intent_id,
      conversation_id: intent.conversation_id,
      prompt_revision_required: true,
    };
  }
}
