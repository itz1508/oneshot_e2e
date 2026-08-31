import { ToolRegistry } from "../tool/registry.js";
import { IntentCollectionService } from "../intent/intent-collection.js";
import { projectIntentGraph } from "../graph/intent-graph.js";

/**
 * Intent Collection Skill — exposes the multi-turn intent state and its
 * graph projection.
 *
 * Tools: get_intent, project_intent_graph
 *
 * This skill ends at Prompt(id).  Planner is never invoked directly from
 * Chat or Intent Collection.
 */
export class IntentCollectionSkill {
  private registry = new ToolRegistry();

  constructor(private intent: IntentCollectionService) {
    this.registry.register(
      { name: "get_intent", description: "Read current multi-turn intent state" },
      ({ conversation_id }: { conversation_id: string }) =>
        this.intent.get(conversation_id),
    );

    this.registry.register(
      {
        name: "project_intent_graph",
        description: "Read Intent Collection graph projection",
      },
      ({ conversation_id }: { conversation_id: string }) =>
        projectIntentGraph(this.intent.get(conversation_id)),
    );
  }

  async invoke<T>(name: string, input: unknown): Promise<T> {
    return (await this.registry.invoke(name, input)) as T;
  }

  definitions() {
    return this.registry.definitions();
  }
}
