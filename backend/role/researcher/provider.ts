import type { Prompt, ResearchBundle } from "../../contracts/schema/types.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";

export interface ResearchProvider {
  research(prompt: Prompt, runId: string): Promise<ResearchBundle>;
  attachEvents?(events: ProcessingEventBus): void;
  close?(): void;
}
