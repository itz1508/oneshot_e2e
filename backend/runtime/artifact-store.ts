import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface ArtifactStore {
  save(runId: string, name: string, value: unknown): Promise<string>;
  load<T>(runId: string, name: string): Promise<T>;
}
export class FileArtifactStore implements ArtifactStore {
  constructor(private root: string) {}
  private path(runId:string,name:string){ return join(this.root,runId,`${name}.json`); }
  async save(runId:string,name:string,value:unknown):Promise<string>{
    const path=this.path(runId,name); await mkdir(dirname(path),{recursive:true});
    const temp=`${path}.${process.pid}.tmp`; await writeFile(temp,JSON.stringify(value,null,2)+"\n","utf8"); await rename(temp,path); return path;
  }
  async load<T>(runId:string,name:string):Promise<T>{ return JSON.parse(await readFile(this.path(runId,name),"utf8")) as T; }
}
