import test from "node:test";
import assert from "node:assert/strict";
import { createCosmosSkill } from "../../skills/cosmos/index.js";
import {
  InMemorySkillActivationStore,
  SkillConversationActivationGate,
} from "../../skills/conversation-activation.js";
import { SkillLoader } from "../../skills/loader.js";

test("Cosmos skill is unavailable when no endpoints are configured", () => {
  const skill = createCosmosSkill({ enabledGroups: ["vision"] });
  assert.equal(skill.available, false);
});

test("Cosmos skill is available when a reasoner URL is configured", () => {
  const skill = createCosmosSkill({
    reasonerUrl: "http://localhost:8000/v1",
    enabledGroups: ["vision"],
  });
  assert.equal(skill.available, true);
});

test("Cosmos skill exposes no tools when inactive", async () => {
  const skill = createCosmosSkill({
    reasonerUrl: "http://localhost:8000/v1",
    enabledGroups: ["vision", "generate"],
  });
  const tools = await skill.getTools();
  assert.ok(tools.length > 0);

  const loader = new SkillLoader({
    registry: new Map([["strands-cosmos", skill]]),
    gate: new SkillConversationActivationGate(new InMemorySkillActivationStore()),
  });
  const loaded = await loader.load("conv-1");
  assert.equal(loaded.tools.length, 0);
});

test("Cosmos skill tools are injected only after activation", async () => {
  const skill = createCosmosSkill({
    reasonerUrl: "http://localhost:8000/v1",
    enabledGroups: ["vision"],
  });
  const store = new InMemorySkillActivationStore();
  const gate = new SkillConversationActivationGate(store);
  await gate.activate(skill.descriptor, "conv-1", undefined, ["vision"], "user");

  const loader = new SkillLoader({
    registry: new Map([["strands-cosmos", skill]]),
    gate,
  });
  const loaded = await loader.load("conv-1");
  assert.equal(loaded.tools.length, 2); // cosmos_reason + cosmos_vision
  assert.ok(loaded.tools.some((t) => t.name === "cosmos_reason"));
  assert.ok(loaded.tools.some((t) => t.name === "cosmos_vision"));
});

test("Cosmos skill exposes reasoner model when configured", async () => {
  const skill = createCosmosSkill({
    reasonerUrl: "http://localhost:8000/v1",
    enabledGroups: ["vision"],
  });
  const models = skill.getModels ? await skill.getModels() : [];
  assert.equal(models.length, 1);
  assert.equal((models[0] as { id: string }).id, "cosmos3-reasoner");
});
