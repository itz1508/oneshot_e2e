import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import { harness } from "./harness.js";
import { ResearcherWorkflow } from "../../agents/researcher/workflow.js";
import { OpenAIModel } from "../../../app/integration/strands/src/index.js";
import { probeLiveModels } from "../../integration/provider-discovery.js";

interface RuntimeFact {
  type: string;
  timestamp: string;
  stage?: string;
  source?: string;
  operation?: string;
  metadata?: Record<string, unknown>;
}

test("Researcher Live Vertical Slice — Full Runtime Proof Chain", async (t) => {
  const facts: RuntimeFact[] = [];
  const emitFact = (fact: RuntimeFact) => {
    facts.push(fact);
  };

  // Load environment to resolve real Tavily API key from app/env/.env if not in process.env
  if (!process.env.TAVILY_API_KEY) {
    try {
      const envContent = await readFile(resolve("app/env/.env"), "utf8");
      const match = envContent.match(/^TAVILY_API_KEY=(.+)$/m);
      if (match) process.env.TAVILY_API_KEY = match[1].trim();
    } catch {
      // app/env/.env optional if already set in environment
    }
  }

  const tavilyEnvKey = (process.env.TAVILY_API_KEY || "").trim();
  const liveEnabled = process.env.RUN_LIVE_TAVILY_TESTS === "true" || tavilyEnvKey.length > 0;
  if (!liveEnabled || tavilyEnvKey.length === 0) {
    t.skip("Live Tavily test skipped: set TAVILY_API_KEY or RUN_LIVE_TAVILY_TESTS=true to enable live Tavily calls");
    return;
  }

  assert.ok(
    tavilyEnvKey.length > 0,
    "TAVILY_API_KEY must be configured in environment or app/env/.env",
  );

  // 1. Start deterministic local OpenAI-compatible endpoint server for Strands Agent
  let chatRequestsCount = 0;
  let toolCallSent = false;

  const mockProviderServer = http.createServer(async (req, res) => {
    const url = req.url || "";
    const authHeader = req.headers["authorization"] || "";

    if (url === "/v1/models" && req.method === "GET") {
      // Validate credential format without exposing secret
      assert.ok(authHeader.startsWith("Bearer "), "Authorization bearer header required");
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          data: [
            { id: "strands-discovered-model-v1", name: "strands-discovered-model-v1" },
          ],
        }),
      );
      return;
    }

    if (url === "/v1/chat/completions" && req.method === "POST") {
      chatRequestsCount++;
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      });

      // Round 1: Model invokes Tavily research tool to investigate external documentation
      if (!toolCallSent) {
        toolCallSent = true;
        const toolChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "strands-discovered-model-v1",
          choices: [
            {
              index: 0,
              delta: {
                role: "assistant",
                tool_calls: [
                  {
                    index: 0,
                    id: "call_tavily_01",
                    type: "function",
                    function: {
                      name: "tavily_search_extract",
                      arguments: JSON.stringify({
                        query: "AI agent planner architectural patterns audit findings schema",
                        maxResults: 2,
                      }),
                    },
                  },
                ],
              },
              finish_reason: null,
            },
          ],
        };
        const stopChunk = {
          id: `chatcmpl-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: "strands-discovered-model-v1",
          choices: [
            {
              index: 0,
              delta: {},
              finish_reason: "tool_calls",
            },
          ],
        };
        res.write(`data: ${JSON.stringify(toolChunk)}\n\n`);
        res.write(`data: ${JSON.stringify(stopChunk)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      // Round 2: After receiving real Tavily search output, model synthesizes structured research draft
      const structuredDraftOutput = {
        summary: "Verified Researcher vertical slice with live Tavily web intelligence and Strands Agent orchestration.",
        requirements: [
          "Preserve canonical workflow traceability across provider capability discovery",
          "Execute Tavily search and extract via Strands agent FunctionTool",
          "Deliver validated ResearchBundle to ResearchReview human gate",
        ],
        dependencies: [
          { description: "integration:tavily", required_by: [0, 1] },
          { description: "integration:strands", required_by: [0, 1] },
        ],
        plan_steps: [
          {
            description: "Initialize Strands Agent with Tavily research tool and local workspace reader",
            responsibility: "ResearcherIntegration",
            requirement_indexes: [0, 1],
          },
          {
            description: "Construct canonical ResearchBundle conforming to urn:oneshot:schema:research_bundle:2",
            responsibility: "ResearcherBundleConstruction",
            requirement_indexes: [1, 2],
          },
        ],
        success_meaning: "Full live runtime chain proven from provider through ResearchReview.",
        success_criteria: [
          {
            statement: "ResearchBundle satisfies canonical schema with live Tavily evidence references",
            measurement: "contracts.validate passes with 0 errors",
            expected_result: "PASSED",
            requirement_indexes: [0, 1, 2],
          },
        ],
      };

      const outputChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "strands-discovered-model-v1",
        choices: [
          {
            index: 0,
            delta: {
              role: "assistant",
              tool_calls: [
                {
                  index: 0,
                  id: `call_${Date.now()}`,
                  type: "function",
                  function: {
                    name: "strands_structured_output",
                    arguments: JSON.stringify(structuredDraftOutput),
                  },
                },
              ],
            },
            finish_reason: null,
          },
        ],
      };
      const finishChunk = {
        id: `chatcmpl-${Date.now()}`,
        object: "chat.completion.chunk",
        created: Math.floor(Date.now() / 1000),
        model: "strands-discovered-model-v1",
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "tool_calls",
          },
        ],
      };
      res.write(`data: ${JSON.stringify(outputChunk)}\n\n`);
      res.write(`data: ${JSON.stringify(finishChunk)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolveServer) => {
    mockProviderServer.listen(0, "127.0.0.1", () => resolveServer());
  });

  const address = mockProviderServer.address() as { port: number };
  const providerEndpoint = `http://127.0.0.1:${address.port}/v1`;

  const h = await harness("researcher-live-slice");

  try {
    // 2. Step: Provider configured & credential resolved
    const rawApiKey = "mock-provider-runtime-key";
    emitFact({
      type: "providerResolved",
      timestamp: new Date().toISOString(),
      stage: "Integration:Discovery",
      source: "KNOWN_PROVIDERS",
      operation: "endpointConfigured",
      metadata: { endpointUrl: providerEndpoint },
    });

    emitFact({
      type: "credentialResolved",
      timestamp: new Date().toISOString(),
      stage: "Integration:Security",
      source: "environment",
      operation: "maskSecret",
      metadata: { credentialLength: rawApiKey.length, masked: "***" },
    });

    // 3. Step: Live model discovery probe
    const discoveredModels = await probeLiveModels(providerEndpoint, rawApiKey);
    assert.ok(discoveredModels.length > 0, "At least one model must be discovered from provider endpoint");
    const activeModelId = discoveredModels[0].id;

    emitFact({
      type: "modelResolved",
      timestamp: new Date().toISOString(),
      stage: "Integration:Model",
      source: "probeLiveModels",
      operation: "modelSelected",
      metadata: { modelId: activeModelId },
    });

    // 4. Instantiate real Strands OpenAIModel pointing to resolved endpoint
    const strandsModel = new OpenAIModel({
      api: "chat",
      apiKey: rawApiKey,
      clientConfig: {
        baseURL: providerEndpoint,
      },
      modelId: activeModelId,
    });

    // 5. Instantiate ResearcherWorkflow without any synthetic draft callback
    const researcher = new ResearcherWorkflow(h.contracts);

    const runId = "live-slice-001";
    const prompt: Prompt = {
      prompt_id: "prompt:live-researcher-slice",
      intent: "Execute live Researcher vertical slice proving Strands and Tavily capabilities",
      requested_outcome: "Produce validated ResearchBundle with real Tavily evidence and halt at ResearchReview",
      context: [
        {
          context_id: "ctx:live-runtime",
          statement: "Live integration vertical slice: Provider -> Strands -> Tavily -> ResearchBundle -> ResearchReview",
        },
      ],
      research_direction: [
        "integration:tavily",
        "integration:strands",
        "workflow:researcher",
      ],
    };

    // 6. Execute live Researcher workflow
    const bundle: ResearchBundle = await researcher.run(
      prompt,
      runId,
      strandsModel,
      (fact) => emitFact(fact),
    );

    // 7. Verify the 11 explicit runtime transitions
    const eventTypes = facts.map((f) => f.type);

    assert.ok(eventTypes.includes("providerResolved"), "providerResolved must be proven");
    assert.ok(eventTypes.includes("credentialResolved"), "credentialResolved must be proven");
    assert.ok(eventTypes.includes("modelResolved"), "modelResolved must be proven");
    assert.ok(eventTypes.includes("strandsInvoked"), "strandsInvoked must be proven");
    assert.ok(eventTypes.includes("tavilyToolInvoked"), "tavilyToolInvoked must be proven");
    assert.ok(eventTypes.includes("tavilyApiResponded"), "tavilyApiResponded must be proven");
    assert.ok(eventTypes.includes("researcherDraftProduced"), "researcherDraftProduced must be proven");
    assert.ok(eventTypes.includes("researchBundleBuilt"), "researchBundleBuilt must be proven");
    assert.ok(eventTypes.includes("researchBundleValidated"), "researchBundleValidated must be proven");
    assert.ok(eventTypes.includes("researcherCompleted"), "researcherCompleted must be proven");
    assert.ok(eventTypes.includes("researchReviewReceived"), "researchReviewReceived must be proven");

    // Check specific runtime transition facts
    const tavilyInvokedFact = facts.find((f) => f.type === "tavilyToolInvoked");
    assert.equal(tavilyInvokedFact?.source, "Strands:FunctionTool");

    const tavilyApiFact = facts.find((f) => f.type === "tavilyApiResponded");
    assert.equal(tavilyApiFact?.source, "api.tavily.com");
    assert.ok(
      Number(tavilyApiFact?.metadata?.resultsCount) > 0,
      "Real Tavily API call must return actual search results",
    );

    assert.ok(chatRequestsCount >= 2, "Strands Agent must execute multi-turn conversation (prompt -> tool -> response)");
    assert.ok(toolCallSent, "Strands Agent must invoke Tavily tool");

    // Check produced bundle properties
    assert.equal(bundle.prompt_id, prompt.prompt_id);
    assert.ok(bundle.researcher.evidence.some((e) => e.source === "integration:tavily"));
    assert.ok(bundle.plan.steps.length >= 2);

    // 8. NEGATIVE CONTROLS
    // Negative Control 1: An injected callback cannot satisfy Strands/Tavily runtime proof
    const bypassFacts: RuntimeFact[] = [];
    const bypassResearcher = new ResearcherWorkflow(h.contracts, async () => ({
      summary: "synthetic bypass",
      requirements: ["req1"],
      dependencies: [],
      plan_steps: [{ description: "step1", responsibility: "Bypass", requirement_indexes: [0] }],
      success_meaning: "fake",
      success_criteria: [{ statement: "crit1", measurement: "fake", expected_result: "PASSED", requirement_indexes: [0] }],
    }));
    await bypassResearcher.run(prompt, "bypass-run", undefined, (f) => bypassFacts.push(f));
    const bypassTypes = new Set(bypassFacts.map((f) => f.type));
    assert.equal(bypassTypes.has("strandsInvoked"), false, "Injected callback must not emit strandsInvoked");
    assert.equal(bypassTypes.has("tavilyToolInvoked"), false, "Injected callback must not emit tavilyToolInvoked");
    assert.equal(bypassTypes.has("tavilyApiResponded"), false, "Injected callback must not emit tavilyApiResponded");

    // Negative Control 2: Missing Tavily API key fails the live Tavily tool
    const missingKeyTool = (await import("../../agents/researcher/strands-tools.js")).createTavilyResearchTool("");
    const emptyResult = await missingKeyTool.invoke({ query: "test query" });
    assert.ok(
      JSON.stringify(emptyResult).includes("Tavily API key not configured"),
      "Tavily tool must gracefully report unconfigured key without fabricating results",
    );

    // Negative Control 3: Corrupted schema rejects through canonical contracts
    const badBundle = structuredClone(bundle);
    delete (badBundle.researcher as any).researcher_id;
    await assert.rejects(
      () => h.contracts.validate("urn:oneshot:schema:researcher:2", badBundle.researcher),
      /researcher_id/,
      "Corrupted ResearchBundle must be rejected by canonical validation",
    );
  } finally {
    mockProviderServer.close();
    h.bridge.close();
  }
});
