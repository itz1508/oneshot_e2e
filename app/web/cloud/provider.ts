import type {
  Prompt,
  ResearchBundle,
} from "../../../backend/contracts/schema/types.js";
import type { ProcessingEventBus } from "../../../backend/runtime/event-bus.js";

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
