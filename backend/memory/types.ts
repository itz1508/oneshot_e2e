import type { IntentStatement } from "../intent/types.js";

export interface ConversationTurn {
  turn_id: string;
  turn_number: number;
  user_message: string;
  created_at: string;
}

export interface MemoryRecord {
  record_id: string;
  section_id: string;
  turn_id: string;
  type_ids: IntentStatement["kind"][];
  record_kind: "fragment";
  text: string;
  created_at: string;
}

export interface FixedIntentSummary {
  summary_id: string;
  section_id: string;
  type_ids: IntentStatement["kind"][];
  source_record_ids: string[];
  source_digest: string;
  body: string;
  created_at: string;
}

export interface ConversationMemory {
  fixed_intent_enabled: boolean;
  sections: MemorySection[];
  records: MemoryRecord[];
  summaries: FixedIntentSummary[];
}

export interface MemorySection {
  section_id: string;
  closed: boolean;
  record_ids: string[];
  created_at: string;
}
