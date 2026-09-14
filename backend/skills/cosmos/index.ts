/**
 * OneShot skill wrapper for strands-cosmos.
 *
 * Default state is inactive. When activated, the skill exposes selected
 * capability groups (vision, generate, action, etc.) as tools and models.
 */
import type { SkillDescriptor, SkillGroup, SkillRuntimeBinding } from "../types.js";
import { CosmosModelBridge } from "./model-bridge.js";
import toolManifest from "./tool-manifest.json" with { type: "json" };

export interface CosmosSkillConfig {
  reasonerUrl?: string;
  generatorModel?: string;
  visionModel?: string;
  enabledGroups: string[];
}

export function createCosmosSkill(config: CosmosSkillConfig): SkillRuntimeBinding {
  const descriptor: SkillDescriptor = {
    skill_id: "strands-cosmos",
    name: "NVIDIA Cosmos Multimodal",
    path: "backend/skills/cosmos",
    capabilities: ["vision", "generate", "action", "curate", "deploy", "evaluate", "system"],
    responsibilities: [
      "Understand video and images with physics-aware reasoning",
      "Generate video, audio, images, and robot actions",
    ],
    tools: toolManifest.tools.map((t) => t.name),
    runtime_type: "python",
    groups: ["vision", "generate", "action", "curate", "deploy", "evaluate", "system"],
    default_active: false,
  };

  const allGroups = descriptor.groups ?? [];
  const available = Boolean(config.reasonerUrl || config.generatorModel || config.visionModel);
  const bridge = new CosmosModelBridge({
    reasonerUrl: config.reasonerUrl,
    generatorModel: config.generatorModel,
    visionModel: config.visionModel,
    enabledGroups: allGroups,
  });

  return {
    descriptor,
    available,
    async getTools() {
      return toolManifest.tools.map((t) => ({
        name: t.name,
        group: t.group as SkillGroup,
        handler: async (input: unknown) => bridge.callTool(t.name, input),
      }));
    },
    async getModels() {
      if (!config.reasonerUrl) return [];
      return [
        {
          id: "cosmos3-reasoner",
          provider: "cosmos",
          endpoint: config.reasonerUrl,
        },
      ];
    },
  };
}
