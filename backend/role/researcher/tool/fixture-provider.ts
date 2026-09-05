import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Prompt, ResearchBundle } from "../../../contracts/schema/types.js";
import type {
  ResearchProvider,
  ResearchProviderReadiness,
} from "../provider.js";
import { clone } from "../../../core/clone.js";

function resolveDefaultFixture(): string {
  const p1 = resolve(process.cwd(), "app/fixtures/product/complete-success-seed.json");
  if (existsSync(p1)) return p1;
  const p2 = resolve(process.cwd(), "fixtures/product/complete-success-seed.json");
  if (existsSync(p2)) return p2;
  return p1;
}

function rewrite(value:unknown,map:Map<string,string>):unknown{
  if(typeof value==="string") return map.get(value) ?? value;
  if(Array.isArray(value)) return value.map(v=>rewrite(v,map));
  if(value&&typeof value==="object") return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rewrite(v,map)]));
  return value;
}
export class FixtureResearchProvider implements ResearchProvider {
constructor(private fixturePath=resolveDefaultFixture()){}
  async ready(_runId:string):Promise<ResearchProviderReadiness>{
    await readFile(this.fixturePath,"utf8");
    return {ready:true,provider:"fixture",models:[],detail:this.fixturePath};
  }
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
