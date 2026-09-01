import type { ProcessingEvent } from "../contract/types.js";
import { ResearcherRole } from "../role/researcher/role.js";
import { PlannerRole } from "../role/planner/role.js";
import { RefactorRole } from "../role/refactor/role.js";
import { GapAnalysisRole } from "../role/gap-analysis/role.js";
import { EvaluationRole } from "../role/evaluation/role.js";

export interface AuthorityNode {
  id: string;
  label: string;
  authority: string;
  responsibility: string;
  skill?: string;
  tool?: string;
  capability?: string;
  input?: string;
  output?: string;
  /** Canonical artifact/state ownership declared by the role boundary. */
  owns?: readonly string[];
  state: "PENDING" | "RUNNING" | "COMPLETE";
  artifact_id?: string;
}

// ---------------------------------------------------------------------------
// Responsibility catalog — maps every processor (including ADK sub-nodes) to
// its authority, responsibility, skill, tool, capability, and I/O boundaries.
// ---------------------------------------------------------------------------

const CATALOG: Record<
  string,
  Omit<AuthorityNode, "id" | "label" | "state" | "artifact_id">
> = {
  Researcher: {
    authority: ResearcherRole.id,
    owns: ResearcherRole.owns,
    responsibility: "research and evidence synthesis",
    skill: "researcher",
    tool: "evidence-collector",
    capability: "ResearchProvider",
    input: "Prompt(id)",
    output: "Researcher(id)",
  },
  Planner: {
    authority: PlannerRole.id,
    owns: PlannerRole.owns,
    responsibility: "read-only review and audit",
    skill: "planner",
    tool: "coverage",
    input: "plan_id",
    output: "audit_id",
  },
  Refactor: {
    authority: RefactorRole.id,
    owns: RefactorRole.owns,
    responsibility: "apply audit refinements",
    skill: "refactor",
    tool: "apply-audit",
    input: "plan_id + audit_id",
    output: "same plan_id",
  },
  GapAnalysis: {
    authority: GapAnalysisRole.id,
    owns: GapAnalysisRole.owns,
    responsibility: "identify/correct remaining plan gaps",
    skill: "gap-analysis",
    tool: "coverage",
    input: "plan_id",
    output: "gap_0 + plan_id",
  },
  Evaluation: {
    authority: EvaluationRole.id,
    owns: EvaluationRole.owns,
    responsibility: "evaluate completed plan",
    skill: "evaluation",
    tool: "evaluate-plan",
    input: "gap_0 + plan_id",
    output: "plan_id + evaluation evidence",
  },
  SchemaValidation: {
    authority: "Validator",
    responsibility: "schema proof",
    skill: "canonical-contracts",
    tool: "validate_schema",
    input: "schema_id + plan_id",
    output: "VALID | NOT_VALID",
  },
  FixtureValidation: {
    authority: "Validator",
    responsibility: "fixture proof",
    skill: "canonical-contracts",
    tool: "run_fixture",
    input: "fixture_id + plan_id",
    output: "VALID | NOT_VALID",
  },
  GoalValidation: {
    authority: "Validator",
    responsibility: "goal proof",
    skill: "canonical-contracts",
    tool: "validate_references",
    input: "goal_id + plan_id",
    output: "VALID | NOT_VALID",
  },
  TripleValidation: {
    authority: "Validator",
    responsibility: "aggregate independent validation proofs",
    skill: "canonical-contracts",
    input: "Schema + Fixture + Goal validation results",
    output: "VALID | NOT_VALID",
  },
  Confirmed: {
    authority: "CanonicalWorkflow",
    responsibility: "confirm only when all validators are VALID",
    skill: "canonical-contracts",
    input: "TripleValidation",
    output: "confirmed_package",
  },
  CreateHash: {
    authority: "CanonicalWorkflow",
    responsibility: "canonicalize confirmed core and create SHA-256",
    skill: "canonical-contracts",
    tool: "create_hash",
    input: "confirmed_package.core",
    output: "HASH",
  },
  Hash: {
    authority: "CanonicalWorkflow",
    responsibility: "recompute and compare hash",
    skill: "canonical-contracts",
    tool: "verify_hash",
    input: "confirmed_package.core + HASH",
    output: "verified HASH",
  },
  Done: {
    authority: "CanonicalWorkflow",
    responsibility: "terminal result projection",
    input: "verified HASH",
    output: "PASSED | ROOT CAUSE",
  },

  // ADK sub-nodes (projection-only — attached to Researcher boundary)
  "ADK:researcher-provider": {
    authority: "Researcher",
    responsibility: "provider invocation",
    skill: "researcher",
    capability: "Google ADK",
    input: "Prompt(id) + evidence",
    output: "research draft",
  },
  "ADK:cache": {
    authority: "Researcher",
    responsibility: "non-canonical draft acceleration",
    capability: "Redis/in-memory cache",
    input: "semantic research request",
    output: "cached draft | miss",
  },
  "ADK:adk-runner": {
    authority: "Researcher",
    responsibility: "model-agent execution",
    capability: "Google ADK LlmAgent/Runner",
    input: "research request",
    output: "model request",
  },
  "ADK:litellm": {
    authority: "Researcher",
    responsibility: "model adapter",
    capability: "LiteLLM ollama_chat",
    input: "ADK model request",
    output: "Ollama request",
  },
  "ADK:ollama": {
    authority: "Researcher",
    responsibility: "local model serving",
    capability: "Ollama",
    input: "model request",
    output: "Gemma inference",
  },
  "ADK:gemma2": {
    authority: "Researcher",
    responsibility: "local inference",
    capability: "Gemma 2 9B",
    input: "structured research request",
    output: "structured response",
  },
  "ADK:research-draft": {
    authority: "Researcher",
    responsibility: "validated provider draft",
    capability: "Pydantic structured output",
    input: "model/cache result",
    output: "research draft",
  },

  // External Sandbox execution boundary nodes (projection-only)
  "ExternalSandbox:admission": {
    authority: "SandboxWorker",
    responsibility: "package structure and canonical hash admission proof",
    skill: "sandbox-runtime",
    tool: "verify_admission",
    input: "confirmed_package + HASH",
    output: "admission verified",
  },
  "ExternalSandbox:runner": {
    authority: "SandboxWorker",
    responsibility: "isolated execution within hardened container/process boundary",
    skill: "sandbox-runtime",
    tool: "execute_sandbox",
    input: "plan + execution_authorization",
    output: "execution result",
  },
  "ExternalSandbox:evidence": {
    authority: "SandboxWorker",
    responsibility: "execution evidence recording (stdout/err refs, metrics, file changes)",
    skill: "sandbox-runtime",
    tool: "audit_sandbox",
    input: "execution output",
    output: "execution_evidence",
  },
  "ExternalSandbox:hash-verification": {
    authority: "SandboxWorker",
    responsibility: "recompute and verify sandbox canonical hash (HASH == hash_sandbox)",
    skill: "sandbox-runtime",
    tool: "verify_hash",
    input: "confirmed_package.core + HASH",
    output: "verified hash_sandbox",
  },
};

/**
 * Project the authority / responsibility / skill / tool / capability graph.
 *
 * This is projection-only metadata — it never authorizes canonical workflow
 * transitions.  The graph is derived from the responsibility catalog plus
 * runtime event state.
 */
export function projectAuthorityGraph(events: ProcessingEvent[] = []) {
  // Resolve latest event per processor
  const latest = new Map<string, ProcessingEvent>();
  for (const e of events) latest.set(e.processor, e);

  // Build nodes from the catalog, overlaying runtime state
  const nodes = Object.entries(CATALOG).map(([id, c]) => {
    const e = latest.get(id);
    return {
      id,
      label: id.replace(/^ADK:/, "ADK / ").replace(/^ExternalSandbox:/, "Sandbox / "),
      ...c,
      state: (e?.state ?? "PENDING") as AuthorityNode["state"],
      artifact_id: e?.artifact_id,
    };
  });

  const ids = new Set(nodes.map((n) => n.id));

  // Canonical workflow edges
  const edges: string[][] = [
    ["Researcher", "Planner"],
    ["Planner", "Refactor"],
    ["Refactor", "GapAnalysis"],
    ["GapAnalysis", "Evaluation"],
    ["Evaluation", "SchemaValidation"],
    ["Evaluation", "FixtureValidation"],
    ["Evaluation", "GoalValidation"],
    ["SchemaValidation", "TripleValidation"],
    ["FixtureValidation", "TripleValidation"],
    ["GoalValidation", "TripleValidation"],
    ["TripleValidation", "Confirmed"],
    ["Confirmed", "CreateHash"],
    ["CreateHash", "Hash"],
    ["Hash", "Done"],
    // Sandbox external handoff chain
    ["Done", "ExternalSandbox:admission"],
    ["ExternalSandbox:admission", "ExternalSandbox:runner"],
    ["ExternalSandbox:runner", "ExternalSandbox:evidence"],
    ["ExternalSandbox:evidence", "ExternalSandbox:hash-verification"],
  ];

  // ADK sub-chain
  const adk = [
    "ADK:researcher-provider",
    "ADK:cache",
    "ADK:adk-runner",
    "ADK:litellm",
    "ADK:ollama",
    "ADK:gemma2",
    "ADK:research-draft",
  ];
  for (let i = 0; i < adk.length - 1; i++) {
    edges.push([adk[i], adk[i + 1]]);
  }

  // Validate traceability — every edge endpoint must resolve
  const unresolved = edges.flat().filter((x) => !ids.has(x));

  return {
    graph_id: "oneshot-authority-trace-v1",
    authority: "projection-only",
    traceability: { valid: unresolved.length === 0, unresolved },
    nodes,
    edges: edges.map(([from, to]) => ({ from, to })),
  };
}
