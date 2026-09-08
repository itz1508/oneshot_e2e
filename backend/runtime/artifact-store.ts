import {
  link,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";

export interface ArtifactStore {
  /** Atomically publish an immutable support artifact; false if already present. */
  create?(runId: string, name: string, value: unknown): Promise<boolean>;
  save(runId: string, name: string, value: unknown): Promise<string>;
  load<T>(runId: string, name: string): Promise<T>;
  /** Remove an invalidated artifact file (plan-revision downstream reset). */
  remove?(runId: string, name: string): Promise<void>;
}
/** Missing artifacts are optional; storage and parsing failures still propagate. */
export async function loadOptionalArtifact<T>(
  store: ArtifactStore,
  runId: string,
  name: string,
): Promise<T | undefined> {
  try {
    return await store.load<T>(runId, name);
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return undefined;
    throw error;
  }
}

export class FileArtifactStore implements ArtifactStore {
  constructor(private root: string) {}
  private path(runId: string, name: string) {
    return join(this.root, runId, `${name}.json`);
  }
  async create(runId: string, name: string, value: unknown): Promise<boolean> {
    const path = this.path(runId, name);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${randomUUID()}.tmp`;
    try {
      await writeFile(temp, JSON.stringify(value) + "\n", {
        encoding: "utf8",
        flag: "wx",
      });
      // A hard link publishes the complete file atomically without replacing a winner.
      try {
        await link(temp, path);
        return true;
      } catch (error: any) {
        if (error.code === "EEXIST") return false;
        throw error;
      }
    } finally {
      await unlink(temp).catch(() => {});
    }
  }
  async save(runId: string, name: string, value: unknown): Promise<string> {
    const path = this.path(runId, name);
    await mkdir(dirname(path), { recursive: true });
    const temp = `${path}.${process.pid}.tmp`;
    await writeFile(temp, JSON.stringify(value, null, 2) + "\n", "utf8");
    await rename(temp, path);
    return path;
  }
  async load<T>(runId: string, name: string): Promise<T> {
    return JSON.parse(await readFile(this.path(runId, name), "utf8")) as T;
  }
  async remove(runId: string, name: string): Promise<void> {
    await unlink(this.path(runId, name)).catch((error: any) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}
