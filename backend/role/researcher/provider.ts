import type { Prompt, ResearchBundle } from "../../contract/types.js";
import type { ProcessingEventBus } from "../../runtime/event-bus.js";

export interface ResearchProviderReadiness {
  ready: boolean;
  provider: string;
  models: string[];
  detail?: string;
}

export interface ResearchProvider {
  research(prompt: Prompt, runId: string): Promise<ResearchBundle>;
  ready(runId: string): Promise<ResearchProviderReadiness>;
  attachEvents?(events: ProcessingEventBus): void;
  close?(): void;
}
