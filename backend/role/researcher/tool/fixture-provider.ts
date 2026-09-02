import { readFile } from "node:fs/promises";
import type { Prompt, ResearchBundle } from "../../../contract/types.js";
import type { ResearchProvider } from "../provider.js";
import { clone } from "../../../core/clone.js";
import { resolveRuntimePaths } from "../../../runtime-paths.js";

function rewrite(value:unknown,map:Map<string,string>):unknown{
  if(typeof value==="string") return map.get(value) ?? value;
  if(Array.isArray(value)) return value.map(v=>rewrite(v,map));
  if(value&&typeof value==="object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,map)]));
  return value;
}
export class FixtureResearchProvider implements ResearchProvider {
  constructor(private fixturePath=resolveRuntimePaths().fixtureFile){}
  async research(prompt:Prompt,runId:string):Promise<ResearchBundle>{
    const seed=JSON.parse(await readFile(this.fixturePath,"utf8")) as ResearchBundle;
    const map=new Map<string,string>([
      ["researcher:seed",`researcher:${runId}`],["plan:seed",`plan:${runId}`],["schema:seed",`schema:${runId}`],["fixture:seed",`fixture:${runId}`],
      ["goal:seed",`goal:${runId}`],["validation:seed",`validation:${runId}`],["req:seed",`req:${runId}`],["criterion:seed",`criterion:${runId}`],
      ["assertion:seed",`assertion:${runId}`],["evidence:seed",`evidence:${runId}`],["step:seed",`step:${runId}`]
    ]);
    const out=rewrite(clone(seed),map) as ResearchBundle; out.prompt=prompt; out.researcher.prompt_id=prompt.prompt_id; return out;
  }
}
