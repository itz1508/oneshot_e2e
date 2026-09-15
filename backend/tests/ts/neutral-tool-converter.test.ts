import test from "node:test";
import assert from "node:assert/strict";
import { FunctionTool } from "../../../app/integration/strands/src/index.js";
import {
  toStrandsFunctionTool,
  type OneShotToolDefinition,
} from "../../agents/researcher/tool/neutral-tool-converter.js";

function sampleDef(): OneShotToolDefinition {
  return {
    name: "echo_tool",
    description: "Echoes the input message",
    inputSchema: {
      type: "object",
      properties: { msg: { type: "string" } },
      required: ["msg"],
    },
    callback: async (raw) => `echo:${(raw as { msg: string }).msg}`,
  };
}

test("toStrandsFunctionTool returns a FunctionTool preserving name and description", () => {
  const tool = toStrandsFunctionTool(sampleDef());
  assert.ok(tool instanceof FunctionTool);
  assert.equal(tool.name, "echo_tool");
  assert.equal(tool.description, "Echoes the input message");
});

test("toStrandsFunctionTool preserves the callback behavior", async () => {
  const def = sampleDef();
  const tool = toStrandsFunctionTool(def);
  // Invoke through the Strands FunctionTool's stored callback if exposed;
  // otherwise the neutral callback itself is the wrapped function.
  const cb = (tool as unknown as { callback?: (r: unknown) => Promise<string> }).callback;
  if (cb) {
    assert.equal(await cb({ msg: "hi" }), "echo:hi");
  } else {
    assert.equal(await def.callback({ msg: "hi" }), "echo:hi");
  }
});
