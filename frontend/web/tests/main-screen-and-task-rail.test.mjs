import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("../../..", import.meta.url));
const read = (p) => readFileSync(join(root, p), "utf8");

describe("OneShot Main Screen, Task Rail & 24 Canonical Invariants Suite", () => {
  it("verifies all Main Screen components exist and are implemented", () => {
    const mainComponents = [
      "frontend/web/src/components/main-screen/ChatShell.tsx",
      "frontend/web/src/components/main-screen/Conversation.tsx",
      "frontend/web/src/components/main-screen/ArtifactView.tsx",
      "frontend/web/src/components/main-screen/PreviewView.tsx",
    ];

    for (const comp of mainComponents) {
      assert.ok(existsSync(join(root, comp)), `Main screen component must exist: ${comp}`);
    }
  });

  it("verifies all Task Management Rail components exist and are implemented", () => {
    const railComponents = [
      "frontend/web/src/components/task-rail/TaskRail.tsx",
      "frontend/web/src/components/task-rail/ActiveTask.tsx",
      "frontend/web/src/components/task-rail/ProgressTracker.tsx",
      "frontend/web/src/components/task-rail/ValidationPanel.tsx",
    ];

    for (const comp of railComponents) {
      assert.ok(existsSync(join(root, comp)), `Task rail component must exist: ${comp}`);
    }
  });

  it("verifies runtime hooks exist (useStream and useTool)", () => {
    assert.ok(existsSync(join(root, "frontend/web/src/lib/useStream.ts")), "useStream.ts must exist");
    assert.ok(existsSync(join(root, "frontend/web/src/lib/useTool.ts")), "useTool.ts must exist");
    assert.ok(existsSync(join(root, "frontend/web/src/types/invariants.ts")), "invariants.ts must exist");
  });

  it("enforces Invariant 1 (Session owns conversation) & Invariant 16 (Session Label != session_id)", () => {
    const typesSrc = read("frontend/web/src/types/invariants.ts");
    assert.match(typesSrc, /session_id:\s*string/);
    assert.match(typesSrc, /sessionLabel:\s*string/);
    assert.match(typesSrc, /conversation:\s*ConversationState/);

    const convoSrc = read("frontend/web/src/components/main-screen/Conversation.tsx");
    assert.match(convoSrc, /Session:\s*\{sessionLabel\}/);
    assert.match(convoSrc, /session_id:\s*\{sessionId\}/);
  });

  it("enforces Invariant 2 (Job owns execution) & Invariant 17 (Job Title != job_id)", () => {
    const typesSrc = read("frontend/web/src/types/invariants.ts");
    assert.match(typesSrc, /job_id:\s*string/);
    assert.match(typesSrc, /jobTitle:\s*string/);
    assert.match(typesSrc, /execution:\s*JobExecutionState/);

    const activeTaskSrc = read("frontend/web/src/components/task-rail/ActiveTask.tsx");
    assert.match(activeTaskSrc, /jobTitle/);
    assert.match(activeTaskSrc, /job_id/);
    assert.match(activeTaskSrc, /execution\.currentStep/);
  });

  it("enforces Invariant 3 (useStream owns conversation runtime) & Invariant 22 (Conversation flows through useStream)", () => {
    const streamSrc = read("frontend/web/src/lib/useStream.ts");
    assert.match(streamSrc, /useStream/);
    assert.match(streamSrc, /conversation/);
    assert.match(streamSrc, /sendMessage/);
    assert.match(streamSrc, /BuildCompleted/);
    assert.match(streamSrc, /ValidationConfirmed/);
  });

  it("enforces Invariant 4 (useTool owns capability runtime) & Invariant 23 (Capabilities execute through useTool)", () => {
    const toolSrc = read("frontend/web/src/lib/useTool.ts");
    assert.match(toolSrc, /useTool/);
    assert.match(toolSrc, /executeTool/);
    assert.match(toolSrc, /capabilities/);
    assert.match(toolSrc, /ToolCapabilityExecution/);
  });

  it("enforces Invariant 8, 9, 18, 24 (Runtime operates on (...), Persistence on _id, Consumer required, Persisted decisions)", () => {
    const artViewSrc = read("frontend/web/src/components/main-screen/ArtifactView.tsx");
    assert.match(artViewSrc, /runtimeName/);
    assert.match(artViewSrc, /consumer/);
    assert.match(artViewSrc, /artifact_id/);
    assert.match(artViewSrc, /PERSISTED/);
    assert.match(artViewSrc, /IN PROGRESS/);
  });

  it("enforces Invariant 10, 12, 13, 20 (Validation blocks promotion, Expected=Observed, No PASS without proof, 4 required fields)", () => {
    const valPanelSrc = read("frontend/web/src/components/task-rail/ValidationPanel.tsx");
    assert.match(valPanelSrc, /Expected/);
    assert.match(valPanelSrc, /Observed/);
    assert.match(valPanelSrc, /Assertion/);
    assert.match(valPanelSrc, /Failure/);
    assert.match(valPanelSrc, /PASS \[PROOF\]/);
    assert.match(valPanelSrc, /canPromote/);
    assert.match(valPanelSrc, /PROMOTION BLOCKED/);
  });

  it("enforces Invariant 14 (No Build Complete without Build Manifest)", () => {
    const previewSrc = read("frontend/web/src/components/main-screen/PreviewView.tsx");
    assert.match(previewSrc, /buildManifest/);
    assert.match(previewSrc, /hasValidBuildManifest/);
    assert.match(previewSrc, /Build Manifest Required for Live Preview/);
  });

  it("verifies Main Screen consumers (useStream, BuildCompleted, ValidationConfirmed)", () => {
    const shellSrc = read("frontend/web/src/components/main-screen/ChatShell.tsx");
    assert.match(shellSrc, /useStream/);
    assert.match(shellSrc, /Conversation/);
    assert.match(shellSrc, /ArtifactView/);
    assert.match(shellSrc, /PreviewView/);
    assert.match(shellSrc, /BuildCompleted/);
  });

  it("verifies Task Management Rail consumers (TasksCreated, PlanUpdated, ValidationConfirmed)", () => {
    const railSrc = read("frontend/web/src/components/task-rail/TaskRail.tsx");
    assert.match(railSrc, /ActiveTask/);
    assert.match(railSrc, /ProgressTracker/);
    assert.match(railSrc, /ValidationPanel/);
    assert.match(railSrc, /TasksCreatedEvent/);
    assert.match(railSrc, /PlanUpdatedEvent/);
    assert.match(railSrc, /ValidationConfirmedEvent/);
  });

  it("verifies market-standard AGENTS.md guidelines and operating boundaries", () => {
    const agentsSrc = read("AGENTS.md");
    assert.match(agentsSrc, /AGENTS\.md — OneShot Project Guidelines/);
    assert.match(agentsSrc, /Strict Workspace Confinement/);
    assert.match(agentsSrc, /Package Manager Standard/);
    assert.match(agentsSrc, /No Fake Progress or Hardcoded Mocks/);
    assert.match(agentsSrc, /Response Verification Invariant/);
    assert.match(agentsSrc, /Streaming & Event Standard \(DeepAgents Architecture\)/);
    assert.match(agentsSrc, /stream\.messages/);
    assert.match(agentsSrc, /stream\.subagents/);
    assert.match(agentsSrc, /stream\.tool_calls/);
    assert.match(agentsSrc, /stream\.values\.todos/);
    assert.match(agentsSrc, /Verification Lifecycle/);
  });
});
