import type { Prompt, ResearchBundle } from "../../contract/types.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";

export interface ResearchProvider {
  research(prompt: Prompt, runId: string): Promise<ResearchBundle>;
  attachEvents?(events: ProcessingEventBus): void;
  close?(): void;
}
