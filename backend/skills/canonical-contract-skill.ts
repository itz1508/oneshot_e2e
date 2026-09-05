import type { ConfirmedCore, HashProof } from "../contracts/schema/types.js";
import { ToolRegistry } from "../tool/registry.js";
import { PythonBridge } from "../validation/python-bridge.js";
import { SkillCatalog } from "./catalog.js";
export class CanonicalContractSkill {
  private registry=new ToolRegistry();private descriptor;
  constructor(private bridge:PythonBridge,catalog=new SkillCatalog()){
    this.descriptor=catalog.get("oneshot-canonical-contracts");
    for(const name of this.descriptor.tools)this.registry.register({name,description:`${this.descriptor.skill_id}:${name}`},async(input)=>await this.bridge.call("skill-tool",{tool:name,input}));
  }
  async invoke<T>(name:string,input:unknown):Promise<T>{return await this.registry.invoke(name,input) as T;}
  private async tool<T>(name:string,input:unknown):Promise<T>{return await this.invoke<T>(name,input);}
  async initialize():Promise<void>{const py=await this.bridge.call<{tools:string[]}>("skill-tools",{});const a=[...this.descriptor.tools].sort(),b=[...py.tools].sort();if(JSON.stringify(a)!==JSON.stringify(b))throw new Error(`Skill tool surface mismatch: ${JSON.stringify(b)}`);}
  async validate(contractId:string,value:unknown):Promise<void>{const r=await this.tool<{valid:boolean;errors:string[]}>("validate_artifact",{contract_id:contractId,value});if(!r.valid)throw new Error(`${contractId}: ${r.errors.join("; ")}`);}
  async validateReferences(core:ConfirmedCore):Promise<void>{const r=await this.tool<{valid:boolean;errors:string[]}>("validate_references",{core});if(!r.valid)throw new Error(`Reference proof failed: ${r.errors.join("; ")}`);}
  async createHash(core:ConfirmedCore):Promise<string>{return (await this.tool<{hash:string}>("create_hash",{core})).hash;}
  async verifyHash(core:ConfirmedCore,expectedHash:string):Promise<HashProof>{return await this.tool<HashProof>("verify_hash",{core,expected_hash:expectedHash});}
  async verifyStatic():Promise<void>{await this.initialize();for(const name of ["validate_registry","validate_graph"]){const r=await this.tool<{valid:boolean;errors:string[]}>(name,{});if(!r.valid)throw new Error(`${name}: ${r.errors.join("; ")}`);}}
  definitions(){return this.registry.definitions();}
}
