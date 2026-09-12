import { createHash } from "node:crypto";
import type {
  ConversationMemory,
  ConversationTurn,
  FixedIntentSummary,
  MemoryRecord,
  MemorySection,
} from "./types.js";
import type { IntentState, IntentStatement } from "../intent/types.js";

const SECTION_MAX = 5;

function digest(v: string): string {
  return createHash("sha256").update(v).digest("hex");
}

function emptyMemory(): ConversationMemory {
  return { fixed_intent_enabled: false, sections: [], records: [], summaries: [] };
}

function uniq<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueUnion(
  arrays: IntentStatement["kind"][][],
): IntentStatement["kind"][] {
  return uniq(arrays.flatMap((a) => a));
}

function sourceDigest(records: MemoryRecord[]): string {
  const entries = records
    .map((r) => `${r.record_id}|${r.type_ids.join(",")}|${r.text}`)
    .join("\n");
  return digest(entries);
}

const CATEGORY_ORDER: IntentStatement["kind"][] = [
  "goal",
  "outcome",
  "requirement",
  "constraint",
  "context",
];

const MAX_SUMMARY_LENGTH = 600;

function compactBody(records: MemoryRecord[]): string {
  const assigned = new Set<string>();
  const parts: string[] = [];

  for (const category of CATEGORY_ORDER) {
    const relevant = records.filter(
      (r) => r.type_ids.includes(category) && !assigned.has(r.record_id),
    );
    if (relevant.length === 0) continue;
    const texts = [
      ...new Set(relevant.map((r) => r.text.trim()).filter(Boolean)),
    ];
    parts.push(`${capitalize(category)}: ${texts.join("; ")}`);
    relevant.forEach((r) => assigned.add(r.record_id));
  }

  const remaining = records
    .filter((r) => !assigned.has(r.record_id))
    .map((r) => r.text.trim())
    .filter(Boolean);
  if (remaining.length) {
    parts.push(`Context: ${[...new Set(remaining)].join("; ")}`);
  }
  if (parts.length === 0) return "No content yet.";

  let summary = parts.join(" | ");
  if (summary.length <= MAX_SUMMARY_LENGTH) return summary;

  // Bound size without truncating authoritative intent (goal/outcome/requirement/constraint).
  // First: compact context to first complete thought / word boundary.
  const ctxIndex = parts.findIndex((p) => p.startsWith("Context:"));
  if (ctxIndex >= 0) {
    const raw = parts[ctxIndex].slice("Context: ".length);
    parts[ctxIndex] = `Context: ${compactContext(raw, 160)}`;
    summary = parts.join(" | ");
    if (summary.length <= MAX_SUMMARY_LENGTH) return summary;
    // Second: drop context entirely; authoritative categories remain intact.
    const withoutContext = parts.filter((_, i) => i !== ctxIndex);
    if (withoutContext.length > 0) return withoutContext.join(" | ");
  }

  return summary;
}

function compactContext(text: string, max: number): string {
  const sentences = text.split(/(?<=[.!?])\s+/);
  if (sentences[0] && sentences[0].length <= max) return sentences[0];
  const t = text.slice(0, max);
  const lastSpace = t.lastIndexOf(" ");
  return lastSpace > 0 ? t.slice(0, lastSpace) + "…" : t + "…";
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export class MemoryService {
  static normalize(memory?: ConversationMemory): ConversationMemory {
    if (!memory) return emptyMemory();
    return {
      fixed_intent_enabled: !!memory.fixed_intent_enabled,
      sections: memory.sections ?? [],
      records: memory.records ?? [],
      summaries: memory.summaries ?? [],
    };
  }

  recordTurn(
    memory: ConversationMemory,
    _conversationId: string,
    turn: ConversationTurn,
    typeIds: IntentStatement["kind"][],
  ): ConversationMemory {
    const m = MemoryService.normalize(memory);
    const recordId = `record:${turn.turn_id}`;
    let section = m.sections.find((s) => !s.closed);
    if (!section) {
      section = {
        section_id: `section:${m.sections.length + 1}`,
        closed: false,
        record_ids: [],
        created_at: new Date().toISOString(),
      };
      m.sections.push(section);
    }

    const record: MemoryRecord = {
      record_id: recordId,
      section_id: section.section_id,
      turn_id: turn.turn_id,
      type_ids: uniq(typeIds),
      record_kind: "fragment",
      text: turn.user_message.trim(),
      created_at: turn.created_at,
    };

    m.records.push(record);
    section.record_ids.push(record.record_id);
    if (section.record_ids.length >= SECTION_MAX) section.closed = true;

    this.refreshInto(m);
    return m;
  }

  setFixedIntent(
    memory: ConversationMemory,
    enabled: boolean,
  ): ConversationMemory {
    const m = MemoryService.normalize(memory);
    m.fixed_intent_enabled = enabled;
    return m;
  }

  refreshSummaries(memory: ConversationMemory): ConversationMemory {
    const m = MemoryService.normalize(memory);
    this.refreshInto(m);
    return m;
  }

  private refreshInto(m: ConversationMemory): void {
    for (const section of m.sections) {
      const expectedId = `summary:${section.section_id}`;
      const recs = section.record_ids
        .map((id) => m.records.find((r) => r.record_id === id))
        .filter((r): r is MemoryRecord => !!r);
      const currentDigest = sourceDigest(recs);
      const existing = m.summaries.find((s) => s.summary_id === expectedId);
      if (existing && existing.source_digest === currentDigest) continue;

      const fresh: FixedIntentSummary = {
        summary_id: expectedId,
        section_id: section.section_id,
        type_ids: uniqueUnion(recs.map((r) => r.type_ids)),
        source_record_ids: recs.map((r) => r.record_id),
        source_digest: currentDigest,
        body: compactBody(recs),
        created_at: new Date().toISOString(),
      };

      const idx = m.summaries.findIndex((s) => s.summary_id === expectedId);
      if (idx >= 0) m.summaries[idx] = fresh;
      else m.summaries.push(fresh);
    }
  }
}
