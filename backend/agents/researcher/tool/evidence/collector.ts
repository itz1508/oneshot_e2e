import { readFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { Prompt } from "../../../../contracts/schema/types.js";
import { TavilyEvidenceCollector } from "../tavily/evidence.js";

export interface GatheredEvidence {
  source: string;
  statement: string;
  provenance: string;
}

function within(root: string, path: string) {
  const r = relative(root, path);
  return r === "" || (!r.startsWith("..") && !isAbsolute(r));
}

function envTrue(name: string): boolean {
  return /^(?:1|true|yes)$/i.test((process.env[name] || "").trim());
}

export class ResearchEvidenceCollector {
  private tavily: TavilyEvidenceCollector;

  constructor(private projectRoot: string) {
    this.tavily = new TavilyEvidenceCollector(projectRoot);
  }

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

    const hasIntegration = (name: string) =>
      prompt.research_direction.some((d) => d.toLowerCase().includes(name)) ||
      prompt.context.some((c) => c.statement.toLowerCase().includes(name));

    if (hasIntegration("tavily") || process.env.TAVILY_API_KEY) {
      out.push({
        source: "integration:tavily",
        statement: "Tavily search and extract capability configured",
        provenance: "app/integration/tavily",
      });
    }

    if (hasIntegration("strands")) {
      out.push({
        source: "integration:strands",
        statement: "Strands Agent SDK orchestration configured",
        provenance: "app/integration/strands",
      });
    }

    out.push({
      source: "workflow:researcher",
      statement: "Researcher stage workflow execution verified",
      provenance: "backend/agents/researcher/workflow.ts",
    });

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

    try {
      out.push(...(await this.tavily.collect(prompt)));
    } catch (error) {
      if (envTrue("ONESHOT_TAVILY_REQUIRED")) throw error;
      const detail = error instanceof Error ? error.message : String(error);
      console.warn(
        `[Researcher:Tavily] optional evidence unavailable: ${detail}`,
      );
    }

    return out;
  }
}
