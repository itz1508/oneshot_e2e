// Browser projections of existing HTTP responses. Backend schema and runtime
// remain authoritative; these types introduce no new payloads or IDs.
export type Conversation = {
  conversation_id: string;
  turns: { turn_id: string; user_message: string; created_at: string }[];
  intent: { ready_for_prompt: boolean; missing_required_information: string[] };
};
export type EventRecord = { event_id: string; sequence: number; processor: string; execution_status: string; created_at: string; message?: string; step_id?: string; scope?: string; test_result?: string };
export type Step = { step_id: string; description: string; responsibility: string };
export type Bundle = {
  goal?: { objective?: string; success_criteria?: { statement: string; measurement?: string; expected_result?: string }[] };
  prompt?: { requested_outcome?: string; research_direction?: string[]; constraints?: string[] };
  plan?: { requirements?: { requirement_id: string; statement: string }[]; steps?: Step[] };
  researcher?: { evidence?: { statement: string; source: string; provenance?: string }[] };
  fixture?: { plan_assertions?: unknown[] };
};
export type Edits = { objective: string; requirements: { id: string; statement: string }[]; steps: { id: string; description: string }[]; notes: string[] };
export type ResearchReview = { run_id: string; revision: number; status: string; created_at: string; research: Bundle; edits: Edits };
export type BuildReview = { run_id: string; hash: string; plan_id: string; revision: number; status: string; created_at: string; validation: { schema: string; fixture: string; goal: string }; steps: Step[] };
export type Run = { run_id: string; pipeline_status: string; current_processor?: string; test_result?: string; events: EventRecord[]; artifacts?: Record<string, unknown>; root_cause?: { issue?: string; expected?: string; actual?: string; required_correction?: string; evidence_ids?: string[] }; hash_proof?: { equal: boolean; created_hash: string; recomputed_hash: string }; updated_at?: string };
export type TreeNode = { name: string; path: string; type: 'file' | 'folder'; children?: TreeNode[]; size?: number };
export type Mutation = { path: string; action: string; bytes?: number; previous_bytes?: number; sha256?: string; previous_sha256?: string };
export type Provider = { id: string; displayName: string; configured: boolean; credentialType: string; credentialSource: string; model?: string; runtime?: { model?: string; apiBase?: string }; apiBaseUrl?: string };
