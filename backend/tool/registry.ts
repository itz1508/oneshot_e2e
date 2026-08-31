export type ToolHandler<I=unknown,O=unknown>=(input:I)=>Promise<O>|O;
export interface ToolDefinition { name:string; description:string }
export class ToolRegistry {
  private tools=new Map<string,{definition:ToolDefinition;handler:ToolHandler}>();
  register<I,O>(definition:ToolDefinition,handler:ToolHandler<I,O>):void{ if(this.tools.has(definition.name)) throw new Error(`Duplicate tool ${definition.name}`); this.tools.set(definition.name,{definition,handler:handler as ToolHandler}); }
  definitions():ToolDefinition[]{ return [...this.tools.values()].map(x=>x.definition); }
  async invoke<I,O>(name:string,input:I):Promise<O>{ const t=this.tools.get(name); if(!t) throw new Error(`Unknown tool ${name}`); return await t.handler(input) as O; }
}
