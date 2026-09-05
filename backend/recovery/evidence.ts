import { randomUUID } from "node:crypto";
import type { RawFailureInput, FailureEvidence } from "./types.js";

/** Maximum evidence items and per-statement length (bounded, never raw logs). */
export const MAX_EVIDENCE_ITEMS = 24;
const MAX_STATEMENT_CHARS = 280;
const MAX_LINE_CHARS = 200;

/**
 * Secret-shaped material is stripped from every evidence statement. Values
 * never reach the recovery layer in the first place, but providers sometimes
 * echo rejected keys inside error text, so statements are redacted too.
 */
export function redactEvidenceText(text: string): string {
  return text
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[REDACTED]")
    .replace(
      /(?:api[_-]?key|authorization|bearer|password|token|secret|credential)"?\s*[:=]\s*"?[^",;\s}]+/gi,
      "[REDACTED]",
    )
    .replace(
      /\b(?:AIza|ghp|gho|github_pat|sk-ant|tvly[-_])[A-Za-z0-9_-]{8,}\b/g,
      "[REDACTED]",
    );
}

/** Remove stack-frame lines ("    at Fn (file.ts:1:2)") from error text. */
export function stripStackFrames(text: string): string {
  return String(text ?? "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*at\s+[\w<>.@$~/]+.*\(/.test(line))
    .join(" ");
}

/** First line only, redacted, hard-bounded — never a full dump. */
function clipLine(text: string, max = MAX_LINE_CHARS): string {
  const line = oneLine(stripStackFrames(text));
  if (!line) return "";
  return line.length > max ? `${line.slice(0, max)}…` : line;
}

function oneLine(text: string): string {
  return redactEvidenceText(String(text ?? "")).replace(/\s+/g, " ").trim();
}

function clip(text: string, max = MAX_STATEMENT_CHARS): string {
  const one = oneLine(stripStackFrames(text));
  return one.length > max ? `${one.slice(0, max)}…` : one;
}

/**
 * Collect bounded, sanitized evidence from the raw failure context.
 * Every item is attributable (source + provenance) and carries a stable
 * evidence id. Raw stacks, full provider responses, and terminal logs are
 * NOT collected here — only bounded references and first-line summaries.
 * Nothing is fabricated: absent context simply produces no evidence item.
 */
export function collectEvidence(input: RawFailureInput): FailureEvidence[] {
  const items: FailureEvidence[] = [];
  const push = (source: string, statement: string, provenance: string): void => {
    if (items.length >= MAX_EVIDENCE_ITEMS) return;
    if (!statement) return;
    items.push({
      evidence_id: `ev:${randomUUID()}`,
      source,
      statement: clip(statement),
      provenance: clip(provenance, 160),
    });
  };

  // Workflow boundary context (always attributable to the run + stage).
  push(
    "workflow",
    `Stage ${input.stage} failed${input.expected ? `; expected: ${clip(input.expected, 120)}` : ""}`,
    `run:${input.runId};stage:${input.stage}`,
  );
  push(
    "workflow",
    `Failure message: ${input.message}`,
    `run:${input.runId};stage:${input.stage}`,
  );

  // Sandbox stdout/stderr + exit code evidence (references, not dumps).
  const sbx = input.sandbox;
  if (sbx) {
    if (sbx.executionId) {
      push("sandbox", `Execution id ${sbx.executionId}`, `execution:${sbx.executionId}`);
    }
    if (Array.isArray(sbx.exitCodes) && sbx.exitCodes.length) {
      push(
        "sandbox",
        `Exit codes: ${sbx.exitCodes.join(", ")}`,
        `execution:${sbx.executionId ?? "unknown"}`,
      );
    }
    if (typeof sbx.firstStderrLine === "string" && sbx.firstStderrLine.trim()) {
      push(
        "sandbox:stderr",
        clipLine(sbx.firstStderrLine),
        `execution:${sbx.executionId ?? "unknown"};ref:${sbx.stderrRefs?.[0] ?? "stderr"}`,
      );
    }
    if (sbx.timedOut) {
      push(
        "sandbox",
        "Execution exceeded its time limit",
        `execution:${sbx.executionId ?? "unknown"}`,
      );
    }
  }

  // Build/compiler evidence.
  const build = input.build;
  if (build) {
    if (build.command) {
      push("build", `Build command: ${clipLine(build.command)}`, `run:${input.runId};stage:${input.stage}`);
    }
    if (typeof build.exitCode === "number") {
      push("build", `Build exited with code ${build.exitCode}`, `run:${input.runId};stage:${input.stage}`);
    }
    if (build.compilerLine) {
      push("build:compiler", clipLine(build.compilerLine), `run:${input.runId};stage:${input.stage}`);
    }
  }

  // Validation evidence: schema/fixture/goal mismatches.
  const v = input.validation;
  if (v) {
    if (v.schemaId) push("validation", `Schema artifact ${v.schemaId}`, `run:${input.runId};schema:${v.schemaId}`);
    if (v.fixtureId) push("validation", `Fixture artifact ${v.fixtureId}`, `run:${input.runId};fixture:${v.fixtureId}`);
    if (v.goalId) push("validation", `Goal artifact ${v.goalId}`, `run:${input.runId};goal:${v.goalId}`);
    if (v.schemaValid === false) {
      push("validation", "Schema validation reported the plan NOT_VALID", `run:${input.runId};plan:${v.planId ?? "unknown"}`);
    }
    for (const a of (v.failedAssertions ?? []).slice(0, 8)) {
      push("validation:fixture", `Unsatisfied assertion ${a}`, `fixture:${v.fixtureId ?? "unknown"}`);
    }
    for (const c of (v.failedCriteria ?? []).slice(0, 8)) {
      push("validation:goal", `Unsatisfied criterion ${c}`, `goal:${v.goalId ?? "unknown"}`);
    }
  }

  // Hash-verification state.
  if (input.hashVerified === false) {
    push("hash", "Hash verification did not match the created hash", `run:${input.runId}`);
  }

  // Artifact references (ids only — content stays in the artifact store).
  for (const artifactId of (input.artifactIds ?? []).slice(0, 12)) {
    push("artifact", `Related artifact ${artifactId}`, `run:${input.runId};artifact:${artifactId}`);
  }

  // Provider status (normalized result only — never the raw response).
  const ps = input.providerStatus;
  if (ps) {
    const providerId = input.provider?.id ?? "unknown";
    if (ps.category) {
      push("provider", `Provider status category: ${ps.category}`, `run:${input.runId};provider:${providerId}`);
    }
    if (typeof ps.retryable === "boolean") {
      push("provider", `Provider failure retryable=${ps.retryable}`, `run:${input.runId};provider:${providerId}`);
    }
    if (ps.message) {
      push("provider", `Provider status: ${clipLine(ps.message)}`, `run:${input.runId};provider:${providerId}`);
    }
  }

  // Non-secret configuration hints.
  for (const [k, v] of Object.entries(input.config ?? {}).slice(0, 8)) {
    push("config", `${k}=${String(v)}`, `run:${input.runId};config`);
  }

  return items;
}