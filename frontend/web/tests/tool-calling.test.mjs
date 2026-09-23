import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("LangChain Tool-Calling Frontend Best Practices", () => {
  const toolCallListPath = path.resolve(__dirname, "../src/components/ToolCallList.tsx");
  const messageBubblePath = path.resolve(__dirname, "../src/components/MessageBubble.tsx");
  const typesPath = path.resolve(__dirname, "../src/types/index.ts");

  it("verifies ToolCallState interface and Message.toolCalls property exist", () => {
    const typesContent = fs.readFileSync(typesPath, "utf-8");
    assert.ok(typesContent.includes("export interface ToolCallState"));
    assert.ok(typesContent.includes('status: "running" | "finished" | "error"'));
    assert.ok(typesContent.includes("toolCalls?: ToolCallState[]"));
  });

  it("verifies ToolCallList implements all three states (running, finished, error)", () => {
    const content = fs.readFileSync(toolCallListPath, "utf-8");
    assert.ok(content.includes("LoadingCard"));
    assert.ok(content.includes("ToolCard"));
    assert.ok(content.includes("isError"));
    assert.ok(content.includes("Running"));
    assert.ok(content.includes("Finished"));
    assert.ok(content.includes("Error"));
  });

  it("verifies collapsible JSON fallback and args preview are present", () => {
    const content = fs.readFileSync(toolCallListPath, "utf-8");
    assert.ok(content.includes("JSON.stringify"));
    assert.ok(content.includes("isExpanded"));
    assert.ok(content.includes("renderResult"));
  });

  it("verifies ToolCallList is rendered inline within MessageBubble", () => {
    const content = fs.readFileSync(messageBubblePath, "utf-8");
    assert.ok(content.includes("import { ToolCallList } from \"./ToolCallList\""));
    assert.ok(content.includes("<ToolCallList toolCalls={message.toolCalls} />"));
  });
});
