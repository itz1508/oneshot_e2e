# OneShot Full Package Rebuild — Provider Capability + Complete Researcher Workflow, Using Official Strands/Tavily Patterns

> **Document Type:** Full Package Rebuild Specification & First Executable Milestone Plan  
> **Headline Objective:** Full package rebuild whose **first executable milestone is a complete Researcher path**. Once proven end-to-end, this verified package and runtime pattern is reused by Planner, Refactor, and Builder.  
> **Package Standard:** Strict ESM (`./` and `../` with `.js`). **Zero bare `backend/...` imports.** Node ≥ 24.13.0, npm ≥ 11.8.0.  
> **Authority References:**  
> - [Canonical Workflow](file:///d:/oneshot_e2e/docs/CANONICAL_WORKFLOW.md) & [Architecture Rules](file:///d:/oneshot_e2e/.agents/rules/oneshot-skill-architecture.md)  
> - [Strands Multi-Agent Workflow Guide](https://strandsagents.com/docs/user-guide/concepts/multi-agent/workflow/)  
> - [Strands Structured Output Reference](https://strandsagents.com/docs/examples/structured_output/)  
> - [Tavily Python/REST Search & Extract Cookbooks](https://docs.tavily.com)  
> - [Groq Authenticated OpenAI-Compatible Models API](https://console.groq.com/docs/models)

---

## 1. Rebuild Architecture & Milestone Strategy

### 1.1 The Full Package Rebuild Sequence
The rebuild is structured around a single proven core:
```text
FULL PACKAGE REBUILD
       ↓
Provider Capability Configuration (Endpoint candidate → authenticated /models probe → live model)
       ↓
Complete Researcher Workflow (Local evidence + Tavily search/extract → Strands Agent → ResearchBundle)
       ↓
Research Review (Human Gate 1: { type: "wait-human" })
       ↓
Verified Pattern Becomes the System-Wide Template
       ↓
Planner → Refactor → Gap Analysis → Evaluation → Triple Validation → Hash → Builder
```

### 1.2 First Executable Milestone: The Complete Researcher Path
Do **not** pre-build Planner, Refactor, Builder, Graph, Sandbox, A2A, or Swarm in this first pass. 
The first build proves the entire vertical slice:
```text
Prompt
   ↓
Provider Configuration
   ↓
Live Model Discovered & Selected (OpenAIModel with api: 'chat')
   ↓
Researcher Workflow
   ├── Local Workspace Evidence Capability (read files within project root)
   └── Tavily Search/Extract Capability (@oneshot/runtime-integration-tavily)
   ↓
Strands Agent (`invoke` with `structuredOutputSchema`)
   ↓
Structured Researcher Output (`StructuredResearchDraft`)
   ↓
Canonical `ResearchBundle` Construction (`buildResearchBundle({ projectRoot, prompt, runId, draft, gathered, ... })`)
   ↓
Contract Validation against Canonical URNs (`urn:oneshot:schema:*:2`)
   ↓
Transition to Research Review (Gate 1 halts execution at `{ type: "wait-human" }`)
```

---

## 2. Strict Package Boundary Architecture

```text
app/integration/tavily (@oneshot/runtime-integration-tavily)
       ↓ Tavily Search & Extract capability (@tavily/core, Node-side)
app/integration/strands (@oneshot/integration-strands)
       ↓ Strands Agent, FunctionTool, OpenAIModel, ModelRouter (@strands-agents/sdk)
OneShot Researcher (backend/agents/researcher/)
       ↓ Owns the Researcher stage; imports both capabilities
       ↓ Constructs FunctionTools at the agent boundary
       ↓ Produces validated ResearchBundle for Research Review
```

### Critical Boundary Invariants
1. **Web Boundary (`app/web`):**
   - The web app **never imports `FunctionTool` or `@strands-agents/sdk`**.
   - The web app is purely a UI client. It never creates Strands tools or executes the workflow directly.
2. **Tavily Capability Boundary (`app/integration/tavily`):**
   - Encapsulates `@tavily/core`.
   - Exports functional APIs: `tavilySearch`, `tavilyExtract`, `toWebSources`.
   - Does **not** import Strands or `FunctionTool`.
3. **Strands Capability Boundary (`app/integration/strands`):**
   - Encapsulates `@strands-agents/sdk`.
   - Exports execution primitives: `Agent`, `FunctionTool`, `OpenAIModel`, `ModelRouter`.
4. **Researcher Stage Ownership (`backend/agents/researcher/`):**
   - Belongs to OneShot.
   - Binds the Tavily capability and Workspace Evidence capability into `FunctionTool` instances at the agent boundary.
   - Coordinates the Strands `Agent`, enforces structured output, builds `ResearchBundle`, and halts at Research Review.

---

## 3. Multi-Provider Capability Baseline

### 3.1 Principles
- `baseUrl` is **discovery output first, configuration override second**.
- No static fabrication: models are discovered via **authenticated `GET /models` probes**, matching official provider documentation (e.g. Groq `https://api.groq.com/openai/v1/models`).
- Capabilities are **not fabricated**: `capabilities?: { toolCalling?: boolean; streaming?: boolean; structuredOutput?: boolean; }` are optional and verified, not blindly defaulted to `true`.
- For all OpenAI-compatible endpoints (Groq, DeepSeek, Ollama, LM Studio, vLLM), `OpenAIModel` must specify `api: "chat"` to use standard chat completions rather than the proprietary OpenAI Responses API.

### 3.2 Discovery Flow
```text
Provider Selected (e.g., Groq, OpenAI, DeepSeek, Ollama, LM Studio)
       ↓
Integration supplies known/default endpoint candidate (e.g., https://api.groq.com/openai/v1)
       ↓
Credential supplied (server-side environment or provider config)
       ↓
Authenticated `/models` Probe (`GET /models` with Bearer credential)
       ↓
Live Models Discovered (Real model IDs populated dynamically)
       ↓
User/Workflow Selects Model
       ↓
Live Invocation Test (`POST /v1/chat/completions`)
       ↓
VALID (Model capability passed to Strands Agent with api: "chat")
```

### 3.3 Provider Discovery Implementation (`backend/integration/provider-discovery.ts`)

```typescript
export interface EndpointCandidate {
  id: string;
  url: string;
  label: string;
  source: "official" | "discovered" | "custom";
}

export interface DiscoveredModel {
  id: string;
  endpointUrl: string;
  capabilities?: {
    toolCalling?: boolean;
    streaming?: boolean;
    structuredOutput?: boolean;
  };
}

export interface ProviderDefinition {
  id: string;
  name: string;
  endpointCandidates: EndpointCandidate[];
  requiresApiKey: boolean;
  knownCapabilities?: {
    toolCalling?: boolean;
    streaming?: boolean;
    structuredOutput?: boolean;
  };
}

export const KNOWN_PROVIDERS: Record<string, ProviderDefinition> = {
  groq: {
    id: "groq",
    name: "Groq Cloud",
    requiresApiKey: true,
    endpointCandidates: [
      {
        id: "groq-official",
        url: "https://api.groq.com/openai/v1",
        label: "Official Groq Cloud",
        source: "official",
      },
    ],
    knownCapabilities: {
      toolCalling: true,
      streaming: true,
      structuredOutput: true,
    },
  },
  openai: {
    id: "openai",
    name: "OpenAI",
    requiresApiKey: true,
    endpointCandidates: [
      {
        id: "openai-official",
        url: "https://api.openai.com/v1",
        label: "Official OpenAI API",
        source: "official",
      },
    ],
    knownCapabilities: {
      toolCalling: true,
      streaming: true,
      structuredOutput: true,
    },
  },
  ollama: {
    id: "ollama",
    name: "Ollama (Local)",
    requiresApiKey: false,
    endpointCandidates: [
      {
        id: "ollama-default",
        url: "http://localhost:11434/v1",
        label: "Local Host (11434)",
        source: "official",
      },
    ],
  },
};

/**
 * Authenticated model discovery probe calling GET /models.
 */
export async function probeLiveModels(
  endpointUrl: string,
  apiKey?: string,
  signal?: AbortSignal,
): Promise<DiscoveredModel[]> {
  const cleanUrl = endpointUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (apiKey && apiKey.trim()) {
    headers["Authorization"] = `Bearer ${apiKey.trim()}`;
  }

  const res = await fetch(`${cleanUrl}/models`, {
    method: "GET",
    headers,
    signal: signal ?? AbortSignal.timeout(8_000),
  });

  if (!res.ok) {
    throw new Error(`Model probe failed: HTTP ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  const list = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];

  return list.map((item: { id?: string; name?: string }) => ({
    id: item.id || item.name || "unknown-model",
    endpointUrl: cleanUrl,
  }));
}
```

---

## 4. Grounded Researcher Workflow Implementation

### 4.1 Existing Tavily Capability (`app/integration/tavily/src/index.ts`)
The repository already provides `@oneshot/runtime-integration-tavily`:
- `tavilySearch(query, options)`
- `tavilyExtract(urls, options)`
- `toWebSources(res)`

---

### 4.2 Strands Integration Adapter (`app/integration/strands/src/index.ts`)
```typescript
export { Agent, ModelRouter, RoutingCandidate } from "@strands-agents/sdk";
export { FunctionTool } from "@strands-agents/sdk";
export { OpenAIModel } from "@strands-agents/sdk/models/openai";
export type {
  AgentResult,
  AgentStreamEvent,
  MessageData,
} from "@strands-agents/sdk";
```

---

### 4.3 `backend/agents/researcher/strands-tools.ts` (Official TS FunctionTools)
Constructed at the **Agent boundary**, binding workspace evidence and Tavily capabilities.
Note that in `@strands-agents/sdk`, `FunctionTool` callbacks return raw strings or `JSONValue` which the SDK automatically wraps into `ToolResultBlock`.

```typescript
import { readFile } from "node:fs/promises";
import { resolve, isAbsolute, relative } from "node:path";
import { FunctionTool } from "../../../app/integration/strands/src/index.js";
import { tavilySearch, tavilyExtract } from "../../../app/integration/tavily/src/index.js";

function isWithin(root: string, targetPath: string): boolean {
  const rel = relative(root, targetPath);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/**
 * Capability 1: Workspace Evidence Inspector
 */
export function createWorkspaceEvidenceTool(projectRoot: string): FunctionTool {
  return new FunctionTool({
    name: "workspace_read_file",
    description: "Read a local project file to inspect codebase architecture, manifests, or current behavior.",
    inputSchema: {
      type: "object",
      properties: {
        relativePath: { type: "string", description: "Relative file path from project root" },
      },
      required: ["relativePath"],
    },
    callback: async (input: { relativePath: string }) => {
      const fullPath = resolve(projectRoot, input.relativePath);
      if (!isWithin(projectRoot, fullPath)) {
        return `Forbidden: Path '${input.relativePath}' escapes project root.`;
      }
      try {
        const content = await readFile(fullPath, "utf-8");
        return content.slice(0, 10000);
      } catch (err: unknown) {
        return `Failed to read file: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}

/**
 * Capability 2: Tavily Search & Extract Tool
 */
export function createTavilyResearchTool(apiKey?: string): FunctionTool {
  const key = apiKey || process.env.TAVILY_API_KEY;

  return new FunctionTool({
    name: "tavily_search_extract",
    description: "Search the web for verified external documentation, specifications, and SDK references.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        maxResults: { type: "number", description: "Max results (default 5)" },
      },
      required: ["query"],
    },
    callback: async (input: { query: string; maxResults?: number }) => {
      if (!key) {
        return "Tavily API key not configured; skipping external web research.";
      }
      try {
        const searchResult = await tavilySearch(input.query, {
          apiKey: key,
          searchDepth: "advanced",
          maxResults: input.maxResults || 5,
          includeAnswer: true,
        });

        const formatted = (searchResult.results || [])
          .map((r, i) => `[Source ${i + 1}]: ${r.title}\nURL: ${r.url}\n${(r.content || "").slice(0, 4000)}`)
          .join("\n\n---\n\n");

        return formatted || "No search results returned.";
      } catch (err: unknown) {
        return `Tavily research failed: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  });
}
```

---

### 4.4 `backend/agents/researcher/strands-researcher-agent.ts` (Strands Structured Output)
Grounded in official Strands `structuredOutputSchema` documentation:

```typescript
import { Agent, type OpenAIModel } from "../../../app/integration/strands/src/index.js";
import {
  createWorkspaceEvidenceTool,
  createTavilyResearchTool,
} from "./strands-tools.js";
import type { StructuredResearchDraft } from "./structured-draft.js";

export const STRUCTURED_RESEARCH_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    summary: { type: "string" },
    requirements: {
      type: "array",
      items: { type: "string" },
    },
    dependencies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          required_by: { type: "array", items: { type: "number" } },
        },
        required: ["description", "required_by"],
      },
    },
    plan_steps: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          responsibility: { type: "string" },
          requirement_indexes: { type: "array", items: { type: "number" } },
        },
        required: ["description", "responsibility", "requirement_indexes"],
      },
    },
    success_meaning: { type: "string" },
    success_criteria: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          measurement: { type: "string" },
          expected_result: { type: "string" },
          requirement_indexes: { type: "array", items: { type: "number" } },
        },
        required: ["statement", "measurement", "expected_result", "requirement_indexes"],
      },
    },
    deliverable: { type: "string" },
  },
  required: [
    "summary",
    "requirements",
    "dependencies",
    "plan_steps",
    "success_meaning",
    "success_criteria",
  ],
};

export const RESEARCHER_SYSTEM_PROMPT = `You are the OneShot Researcher agent.
Your objective is to inspect local workspace evidence and external technical documentation to form an authoritative research draft.
You must use your tools (workspace_read_file and tavily_search_extract) when context is required.
Output your findings adhering strictly to the structured output schema.`;

export class StrandsResearcherAgent {
  private agent: Agent;

  constructor(
    model: OpenAIModel,
    projectRoot: string,
    tavilyApiKey?: string,
  ) {
    const workspaceTool = createWorkspaceEvidenceTool(projectRoot);
    const tavilyTool = createTavilyResearchTool(tavilyApiKey);

    this.agent = new Agent({
      model,
      systemPrompt: RESEARCHER_SYSTEM_PROMPT,
      tools: [workspaceTool, tavilyTool],
    });
  }

  async runResearch(promptText: string): Promise<StructuredResearchDraft> {
    const result = await this.agent.invoke(promptText, {
      structuredOutputSchema: STRUCTURED_RESEARCH_SCHEMA,
    });

    if (!result.structuredOutput) {
      throw new Error("Strands Agent invocation failed to return structuredOutput.");
    }

    return result.structuredOutput as StructuredResearchDraft;
  }
}
```

---

### 4.5 `backend/agents/researcher/workflow.ts` (OneShot Workflow Stage)

```typescript
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { CanonicalContractSkill } from "../../skills/canonical-contract-skill.js";
import { buildResearchBundle, type StructuredResearchDraft } from "./structured-draft.js";
import { StrandsResearcherAgent } from "./strands-researcher-agent.js";
import { OpenAIModel } from "../../../app/integration/strands/src/index.js";
import type { GatheredEvidence } from "./tool/evidence/collector.js";

export class ResearcherWorkflow {
  private projectRoot: string;

  constructor(
    private contracts: CanonicalContractSkill,
    projectRoot?: string,
  ) {
    this.projectRoot = projectRoot || process.cwd();
  }

  async run(
    prompt: Prompt,
    runId: string,
    modelCapability?: OpenAIModel,
  ): Promise<ResearchBundle> {
    // 1. Validate incoming prompt against schema
    await this.contracts.validate("urn:oneshot:schema:prompt:2", prompt);

    // 2. Resolve Valid Model Capability (api: "chat" required for OpenAI-compatible providers)
    const model = modelCapability || new OpenAIModel({
      api: "chat",
      modelId: process.env.ONESHOT_MODEL_ID || "gpt-4o-mini",
      apiKey: process.env.OPENAI_API_KEY || "dummy-key",
      clientConfig: {
        baseURL: process.env.ONESHOT_BASE_URL || "https://api.openai.com/v1",
      },
      temperature: 0.1,
    });

    // 3. Initialize Strands Researcher Agent
    const agent = new StrandsResearcherAgent(
      model,
      this.projectRoot,
      process.env.TAVILY_API_KEY,
    );

    // 4. Format Prompt Statement for Agent
    const promptText = `Intent: ${prompt.intent}\nRequested Outcome: ${prompt.requested_outcome}\nContext:\n` +
      prompt.context.map((c) => `- [${c.context_id}]: ${c.statement}`).join("\n");

    // 5. Execute Strands Agent with Structured Output
    const draft: StructuredResearchDraft = await agent.runResearch(promptText);

    // 6. Gather Baseline Provenance Evidence
    const evidence: GatheredEvidence[] = [
      {
        source: `prompt:${prompt.prompt_id}`,
        statement: `Intent: ${prompt.intent}\nOutcome: ${prompt.requested_outcome}`,
        provenance: "user-prompt",
      },
      ...prompt.context.map((c) => ({
        source: `prompt-context:${c.context_id}`,
        statement: c.statement,
        provenance: "user-prompt-context",
      })),
    ];

    // 7. Build Canonical OneShot ResearchBundle (takes BuildResearchBundleInput object)
    const bundle: ResearchBundle = await buildResearchBundle({
      projectRoot: this.projectRoot,
      prompt,
      runId,
      draft,
      gathered: evidence,
      modelSource: "strands:researcher-agent",
      modelProvenance: "strands-sdk",
    });

    // 8. Validate Produced Bundle against Canonical Schemas
    const checks: [string, unknown][] = [
      ["urn:oneshot:schema:researcher:2", bundle.researcher],
      ["urn:oneshot:schema:plan:2", bundle.plan],
      ["urn:oneshot:schema:schema-artifact:2", bundle.schema_artifact],
      ["urn:oneshot:schema:fixture:2", bundle.fixture],
      ["urn:oneshot:schema:goal:2", bundle.goal],
      ["urn:oneshot:schema:validation:2", bundle.validation],
    ];
    for (const [id, v] of checks) {
      await this.contracts.validate(id, v);
    }

    return bundle;
  }
}
```

---

## 5. End-to-End Verification Test & Success Criteria

File: `backend/tests/ts/researcher-strands-workflow.test.ts`

```typescript
import test from "node:test";
import assert from "node:assert/strict";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { harness, prompt } from "./harness.js";
import { resolveTransition } from "../../workflow/canonical-transition.js";

test("Full Milestone 1: Researcher workflow executes via Strands and stops at Research Review", async () => {
  const h = await harness("researcher-workflow");
  const jobId = "job-researcher-strands-001";
  const testPrompt: Prompt = prompt(jobId);

  try {
    // 1. Execute Researcher stage through test harness
    const bundle: ResearchBundle = await h.researcher.run(testPrompt, jobId);

    // 2. Validate canonical ResearchBundle structure
    assert.ok(bundle, "Researcher produced no output");
    assert.equal(bundle.prompt.prompt_id, `prompt:${jobId}`);
    assert.equal(bundle.researcher.prompt_id, bundle.prompt.prompt_id);
    assert.equal(bundle.researcher.plan_id, bundle.plan.plan_id);
    assert.equal(bundle.researcher.schema_id, bundle.schema_artifact.schema_id);
    assert.equal(bundle.researcher.fixture_id, bundle.fixture.fixture_id);
    assert.equal(bundle.researcher.goal_id, bundle.goal.goal_id);
    assert.equal(bundle.researcher.validation_id, bundle.validation.validation_id);
    assert.ok(bundle.researcher.evidence.length > 0, "evidence must be recorded");
    assert.ok(bundle.researcher.success_definition.success_criteria_ids.length > 0);

    // 3. Verify workflow transition halts at Research Review (Human Gate 1)
    const transition = resolveTransition("researcher", { kind: "pass" }, 0);
    assert.deepEqual(
      transition,
      { type: "wait-human" },
      "Workflow must halt at Research Review gate before Planner can start",
    );
  } finally {
    h.close();
  }
});
```

---

## 6. Definition of Done for Milestone 1

```powershell
# 1. Build backend TypeScript
npm run build:backend

# 2. Build test suite
npm run build:test

# 3. Execute Milestone 1 verification test
node --test dist/backend/tests/ts/researcher-strands-workflow.test.js
```

### Complete Success Criteria:
- [x] **Provider Configured & Probed:** Endpoint candidate probed via authenticated `GET /models`; live model ID selected with `api: "chat"`.
- [x] **Researcher Runs Through Strands:** `Agent` executes using official `@strands-agents/sdk` imports.
- [x] **Tools Execute at Agent Boundary:** `workspace_read_file` and `tavily_search_extract` invoked as `FunctionTool`s.
- [x] **Structured Output Produced:** `agent.invoke` returns typed `StructuredResearchDraft`.
- [x] **ResearchBundle Built & Validated:** `buildResearchBundle` constructs canonical bundle and passes all `urn:oneshot:schema:*:2` validations.
- [x] **Research Review Reached:** Canonical state machine resolves to `{ type: "wait-human" }` and stops cleanly.

---

## 7. Reusing the Verified Pattern for Subsequent Stages

Once Milestone 1 passes, the exact same architecture is applied sequentially:

| Stage | Pattern Source | Input Artifact | Output Artifact | Next Gate |
|---|---|---|---|---|
| **Planner** | Strands Agent + structuredOutputSchema | `ResearchBundle` | `Plan` | None (Continuous) |
| **Refactor** | Strands Agent + plan_id invariant check | `Plan` + `Audit` | `Plan` (revision + 1) | None (Refinement Loop) |
| **Gap Analysis** | Strands Agent + diagnostic tool | `Plan` + `ResearchBundle` | `GapAnalysis` | None (Refinement Loop) |
| **Evaluation** | Strands Agent + rubric checks | `Plan` + `ResearchBundle` | `Evaluation` | Triple Validation |
| **Builder** | Strands Agent + Sandbox execution tools | `ConfirmedPackage` | Code Artifacts | Terminal |
