import { ToolRegistry } from "../../../tool/registry.js";
import type { Prompt, ResearchBundle } from "../../../contracts/schema/types.js";
import type { ResearchProvider } from "../provider.js";
export function researcherTools(provider:ResearchProvider){ const r=new ToolRegistry(); r.register<{prompt:Prompt;runId:string},ResearchBundle>({name:"research",description:"Resolve the configured ResearchProvider and return the Researcher-owned canonical bundle."},({prompt,runId})=>provider.research(prompt,runId)); return r; }
