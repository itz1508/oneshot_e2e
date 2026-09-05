import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Prompt } from "../../../../contracts/schema/types.js";

export interface GatheredEvidence {
  source: string;
  statement: string;
  provenance: string;
}

function within(root: string, path: string) {
  const r = relative(root, path);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

export class ResearchEvidenceCollector {
  constructor(private projectRoot: string) {}

  async collect(prompt: Prompt): Promise<GatheredEvidence[]> {
    const out: GatheredEvidence[] = [
      {
        source: `prompt:${prompt.prompt_id}`,
        statement: `Intent: ${prompt.intent}\nRequested outcome: ${prompt.requested_outcome}`,
        provenance: "user-prompt",
      },
      ...prompt.context.map((c) => ({
        source: `prompt-context:${c.context_id}`,
        statement: c.statement,
        provenance: "user-prompt-context",
      })),
    ];

    const configured = (process.env.ONESHOT_RESEARCH_EVIDENCE_FILES || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    const roots = (
      process.env.ONESHOT_RESEARCH_EVIDENCE_ROOTS || this.projectRoot
    )
      .split(",")
      .map((x) => resolve(x.trim()))
      .filter(Boolean);
    const max = Math.max(
      1024,
      Number(process.env.ONESHOT_RESEARCH_EVIDENCE_MAX_BYTES || 16384),
    );

    for (const item of configured) {
      const p = resolve(this.projectRoot, item);
      if (!roots.some((r) => within(r, p))) {
        throw new Error(`evidence file outside allowlisted roots: ${item}`);
      }
      const raw = await readFile(p, "utf8");
      out.push({
        source: `file:${relative(this.projectRoot, p)}`,
        statement: raw.slice(0, max),
        provenance: p,
      });
    }

    return out;
  }
}
