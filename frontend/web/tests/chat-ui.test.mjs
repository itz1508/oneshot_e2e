import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

describe("OneShot Modern Chat UI — Architecture & Contracts", () => {
  it("verifies all core components exist and are implemented", () => {
    const components = [
      "frontend/web/src/components/App.tsx",
      "frontend/web/src/components/Sidebar.tsx",
      "frontend/web/src/components/HeaderBar.tsx",
      "frontend/web/src/components/EarlierConversation.tsx",
      "frontend/web/src/components/EphemeralActivity.tsx",
      "frontend/web/src/components/MessageBubble.tsx",
      "frontend/web/src/components/Composer.tsx",
      "frontend/web/src/components/ContextReviewDrawer.tsx",
      "frontend/web/src/components/ProviderConfigModal.tsx",
    ];

    for (const comp of components) {
      assert.ok(existsSync(join(root, comp)), `Component must exist: ${comp}`);
    }
  });

  it("verifies Next.js App Router entrypoints exist", () => {
    assert.ok(existsSync(join(root, "frontend/web/app/layout.tsx")), "layout.tsx must exist");
    assert.ok(existsSync(join(root, "frontend/web/app/page.tsx")), "page.tsx must exist");
    assert.ok(existsSync(join(root, "frontend/web/app/globals.css")), "globals.css must exist");
  });

  it("verifies provider definitions include Gemini, OpenAI, and Nebius Token Factory", () => {
    const providersSrc = read("frontend/web/src/lib/providers.ts");
    assert.match(providersSrc, /gemini:/);
    assert.match(providersSrc, /openai:/);
    assert.match(providersSrc, /nebius:/);
    assert.match(providersSrc, /Token Factory/);
    assert.match(providersSrc, /gemini-2\.5-flash/);
    assert.match(providersSrc, /moonshotai\/Kimi-K2\.5/);
    assert.match(providersSrc, /deepseek-ai\/DeepSeek-R1-0528/);
  });

  it("verifies EarlierConversation has the micro-switch toggle and copy reference", () => {
    const earlierSrc = read("frontend/web/src/components/EarlierConversation.tsx");
    assert.match(earlierSrc, /earlier-switch/);
    assert.match(earlierSrc, /Earlier Conversation/);
    assert.match(earlierSrc, /oneshot:\/\/context\//);
  });

  it("verifies ContextReviewDrawer implements the 4-cell metadata grid", () => {
    const drawerSrc = read("frontend/web/src/components/ContextReviewDrawer.tsx");
    assert.match(drawerSrc, /Date/);
    assert.match(drawerSrc, /Time/);
    assert.match(drawerSrc, /Agent/);
    assert.match(drawerSrc, /Restore ID/);
    assert.match(drawerSrc, /Original Content/);
  });

  it("verifies EphemeralActivity has pulse animation and step checklist", () => {
    const activitySrc = read("frontend/web/src/components/EphemeralActivity.tsx");
    assert.match(activitySrc, /activity-pulse/);
    assert.match(activitySrc, /steps\.map/);
  });

  it("verifies ProviderConfigModal enforces server security boundary without browser secret inputs", () => {
    const modalSrc = read("frontend/web/src/components/ProviderConfigModal.tsx");
    assert.match(modalSrc, /Server Security Boundary/);
    assert.match(modalSrc, /\/api\/providers\/status/);
    assert.match(modalSrc, /checkServerReadiness/);
    // Credentials stay strictly server-side; no raw password or secret inputs
    assert.doesNotMatch(modalSrc, /type=["']password["']/);
    assert.doesNotMatch(modalSrc, /modalApiKeyInput/);
  });

  it("verifies no obsolete demo files or deep-agent-todo-list patterns remain", () => {
    assert.ok(
      !existsSync(join(root, "frontend/web/public/embed/researcher-workflow-demo.html")),
      "demo html must not exist"
    );
    assert.ok(
      !existsSync(join(root, "frontend/web/src/patterns/deep-agent-todo-list")),
      "deep-agent-todo-list must not exist"
    );
  });

  it("verifies Google Gemini setup enforces server credential ownership without browser secrets", () => {
    const apiSrc = read("frontend/web/src/lib/api.ts");
    const modalSrc = read("frontend/web/src/components/ProviderConfigModal.tsx");
    const publicHtml = read("frontend/web/public/index.html");

    // Server-side status probing
    assert.match(apiSrc, /\/api\/providers\/status/);
    assert.match(modalSrc, /\/api\/providers\/status/);
    assert.match(publicHtml, /\/api\/providers\/status/);

    // Browser does NOT expose editable bearer tokens or provider API keys
    assert.doesNotMatch(modalSrc, /ONESHOT_API_TOKEN/);
    assert.doesNotMatch(modalSrc, /modalApiKeyInput/);
    assert.doesNotMatch(publicHtml, /modalApiKeyInput/);
    assert.doesNotMatch(apiSrc, /sessionStorage\.setItem/);
  });

  it("verifies Strands ToolResultBlock schema and structured tool event contract", () => {
    const apiSrc = read("frontend/web/src/lib/api.ts");
    const activitySrc = read("frontend/web/src/components/EphemeralActivity.tsx");

    // Strands ToolResultBlock schema
    assert.match(apiSrc, /interface StrandsToolResultBlock/);
    assert.match(apiSrc, /toolResultBlock/);
    assert.match(apiSrc, /toolUseId/);
    assert.match(apiSrc, /"success" \| "error"/);

    // Structured tool events in ephemeral activity
    assert.match(activitySrc, /vended_tool:/);
    assert.match(activitySrc, /ToolResultBlock:/);
  });

  it("verifies Strands streaming async iterator pattern (iterateAgentStream) with real SSE", () => {
    const apiSrc = read("frontend/web/src/lib/api.ts");
    assert.match(apiSrc, /async function\* iterateAgentStream/);
    assert.match(apiSrc, /for await \(const event of iterateAgentStream/);
    assert.match(apiSrc, /beforeInvocationEvent/);
    assert.match(apiSrc, /afterInvocationEvent/);
    assert.match(apiSrc, /\/api\/agent\/stream/);
  });

  it("verifies packages/agent-runtime uses @strands-agents/sdk with Gemini auth", () => {
    const agentSrc = read("packages/agent-runtime/src/agents/deep-agent-todo-list.ts");
    assert.match(agentSrc, /@strands-agents\/sdk/);
    assert.match(agentSrc, /resolveGeminiModel/);
    assert.match(agentSrc, /createStrandsAgent/);
    assert.match(agentSrc, /streamAgent/);
    assert.match(agentSrc, /toolResultBlock/);
    assert.doesNotMatch(agentSrc, /from "deepagents"/);
    assert.doesNotMatch(agentSrc, /from "langchain"/);
  });

  it("verifies AG-UI protocol integration, server adapter, and human approval gates", () => {
    const agUiSrc = read("frontend/web/src/lib/ag-ui.ts");
    const apiSrc = read("frontend/web/src/lib/api.ts");
    const serverAdapterSrc = read("packages/agent-runtime/src/ag-ui/server-adapter.ts");

    // AG-UI Event Types on Client
    assert.match(agUiSrc, /RUN_START/);
    assert.match(agUiSrc, /RUN_FINISH/);
    assert.match(agUiSrc, /STEP_START/);
    assert.match(agUiSrc, /STEP_FINISH/);
    assert.match(agUiSrc, /TEXT_MESSAGE_DELTA/);
    assert.match(agUiSrc, /TOOL_CALL_START/);
    assert.match(agUiSrc, /TOOL_CALL_FINISH/);
    assert.match(agUiSrc, /HUMAN_APPROVAL_REQUEST/);

    // Server-Side AG-UI Adapter
    assert.match(serverAdapterSrc, /streamStrandsToAgUi/);
    assert.match(serverAdapterSrc, /formatAgUiSse/);
    assert.match(serverAdapterSrc, /RUN_START/);
    assert.match(serverAdapterSrc, /TEXT_MESSAGE_DELTA/);

    // Re-export in api.ts
    assert.match(apiSrc, /export \* from "\.\/ag-ui"/);
  });

  it("verifies DeepAgents Backends and Multi-Agent Handoffs frontend models and drawer UI", () => {
    const backendsSrc = read("frontend/web/src/lib/backends.ts");
    const handoffsSrc = read("frontend/web/src/lib/handoffs.ts");
    const apiSrc = read("frontend/web/src/lib/api.ts");
    const drawerSrc = read("frontend/web/src/components/ContextReviewDrawer.tsx");

    // Backends model
    assert.match(backendsSrc, /\/workspace\//);
    assert.match(backendsSrc, /\/scratch\//);
    assert.match(backendsSrc, /\/memories\//);
    assert.match(backendsSrc, /\/artifacts\//);
    assert.match(backendsSrc, /virtualMode:\s*true/);

    // Handoffs model
    assert.match(handoffsSrc, /CANONICAL_STAGES/);
    assert.match(handoffsSrc, /Research Review/);
    assert.match(handoffsSrc, /Build Ready/);
    assert.match(handoffsSrc, /requiresPackageHash/);

    // Re-exports in api.ts
    assert.match(apiSrc, /export \* from "\.\/backends"/);
    assert.match(apiSrc, /export \* from "\.\/handoffs"/);

    // ContextReviewDrawer 3-tab navigation and human gates
    assert.match(drawerSrc, /tab === "backends"/);
    assert.match(drawerSrc, /Gate 1: Research Review/);
    assert.match(drawerSrc, /Gate 2: Build Ready/);
    assert.match(drawerSrc, /CANONICAL_BACKEND_PARTITIONS/);
  });
});
