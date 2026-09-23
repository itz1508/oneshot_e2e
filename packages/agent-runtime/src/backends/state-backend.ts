/**
 * OneShot StateBackend — Ephemeral In-Memory Storage for Deep Agents
 *
 * Implements the thread-scoped StateBackend pattern per:
 * https://docs.langchain.com/oss/python/deepagents/backends#statebackend
 *
 * Characteristics:
 * - Thread-scoped and ephemeral (lives in agent memory/state).
 * - Serves as a scratchpad for intermediate agent reasoning.
 * - Houses offloaded large tool results (/large_tool_results/) and conversation history (/conversation_history/)
 *   so they never contaminate the host filesystem or project root.
 * - Shared safely across subagents within the active thread.
 */

import type {
  BackendProtocol,
  DeleteResult,
  EditResult,
  FileEntry,
  GlobResult,
  GrepMatch,
  GrepResult,
  LsResult,
  ReadResult,
  WriteResult,
} from "./protocol.js";

export class StateBackend implements BackendProtocol {
  readonly name = "StateBackend";
  private files = new Map<string, string>();
  private timestamps = new Map<string, string>();

  constructor(initialFiles?: Record<string, string>) {
    if (initialFiles) {
      for (const [path, content] of Object.entries(initialFiles)) {
        this.setFile(path, content);
      }
    }
  }

  private normalize(filePath: string): string {
    const cleaned = filePath.replace(/\\/g, "/").replace(/\/+/g, "/");
    return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  }

  private setFile(path: string, content: string): void {
    const normalized = this.normalize(path);
    this.files.set(normalized, content);
    this.timestamps.set(normalized, new Date().toISOString());
  }

  async ls(dirPath: string): Promise<LsResult> {
    try {
      const normalizedDir = this.normalize(dirPath);
      const prefix = normalizedDir.endsWith("/") ? normalizedDir : `${normalizedDir}/`;
      const entriesMap = new Map<string, FileEntry>();

      for (const [filePath, content] of this.files.entries()) {
        if (filePath.startsWith(prefix)) {
          const relative = filePath.slice(prefix.length);
          const parts = relative.split("/");
          const isDir = parts.length > 1;
          const entryName = parts[0];
          const fullEntryPath = `${prefix}${entryName}`;

          if (!entriesMap.has(fullEntryPath)) {
            entriesMap.set(fullEntryPath, {
              path: fullEntryPath,
              name: entryName,
              isDir,
              sizeBytes: isDir ? undefined : Buffer.byteLength(content, "utf8"),
              modifiedAt: isDir ? undefined : this.timestamps.get(filePath),
            });
          }
        }
      }

      return { entries: Array.from(entriesMap.values()) };
    } catch (err: unknown) {
      return { entries: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  async read(filePath: string, offset = 0, limit?: number): Promise<ReadResult> {
    try {
      const normalized = this.normalize(filePath);
      const content = this.files.get(normalized);

      if (content === undefined) {
        return { error: `File not found: ${normalized}` };
      }

      const totalLength = content.length;
      const start = Math.max(0, offset);
      const slice = limit !== undefined ? content.slice(start, start + limit) : content.slice(start);
      const isTruncated = start + slice.length < totalLength;

      return {
        content: slice,
        bytesRead: Buffer.byteLength(slice, "utf8"),
        truncated: isTruncated,
      };
    } catch (err: unknown) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    try {
      const normalized = this.normalize(filePath);
      this.setFile(normalized, content);
      return {
        success: true,
        path: normalized,
        bytesWritten: Buffer.byteLength(content, "utf8"),
      };
    } catch (err: unknown) {
      return { success: false, path: filePath, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false
  ): Promise<EditResult> {
    try {
      const normalized = this.normalize(filePath);
      const content = this.files.get(normalized);

      if (content === undefined) {
        return { success: false, path: normalized, error: `File not found: ${normalized}` };
      }

      if (!content.includes(oldString)) {
        return { success: false, path: normalized, error: `Target substring not found in ${normalized}` };
      }

      let count = 0;
      let newContent: string;

      if (replaceAll) {
        const parts = content.split(oldString);
        count = parts.length - 1;
        newContent = parts.join(newString);
      } else {
        count = 1;
        newContent = content.replace(oldString, newString);
      }

      this.setFile(normalized, newContent);
      return { success: true, path: normalized, replacementsCount: count };
    } catch (err: unknown) {
      return { success: false, path: filePath, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async glob(pattern: string, pathPrefix = "/"): Promise<GlobResult> {
    try {
      const normalizedPrefix = this.normalize(pathPrefix);
      const regexStr = pattern
        .replace(/\./g, "\\.")
        .replace(/\*\*/g, ".*")
        .replace(/(?<!\.)\*/g, "[^/]*")
        .replace(/\?/g, ".");
      const regex = new RegExp(`^${regexStr}$`);

      const matches: string[] = [];
      for (const filePath of this.files.keys()) {
        if (filePath.startsWith(normalizedPrefix) || normalizedPrefix === "/") {
          const relativeOrFull = filePath.startsWith("/") ? filePath.slice(1) : filePath;
          if (regex.test(filePath) || regex.test(relativeOrFull)) {
            matches.push(filePath);
          }
        }
      }

      return { matches };
    } catch (err: unknown) {
      return { matches: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  async grep(pattern: string, pathPrefix = "/"): Promise<GrepResult> {
    try {
      const normalizedPrefix = this.normalize(pathPrefix);
      const matches: GrepMatch[] = [];

      for (const [filePath, content] of this.files.entries()) {
        if (filePath.startsWith(normalizedPrefix) || normalizedPrefix === "/") {
          const lines = content.split("\n");
          lines.forEach((line, index) => {
            if (line.includes(pattern)) {
              matches.push({
                path: filePath,
                lineNumber: index + 1,
                lineContent: line,
              });
            }
          });
        }
      }

      return { matches };
    } catch (err: unknown) {
      return { matches: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  async delete(filePath: string): Promise<DeleteResult> {
    try {
      const normalized = this.normalize(filePath);
      let deleted = false;

      // Direct file delete
      if (this.files.has(normalized)) {
        this.files.delete(normalized);
        this.timestamps.delete(normalized);
        deleted = true;
      }

      // Recursive directory delete
      const dirPrefix = normalized.endsWith("/") ? normalized : `${normalized}/`;
      for (const key of Array.from(this.files.keys())) {
        if (key.startsWith(dirPrefix)) {
          this.files.delete(key);
          this.timestamps.delete(key);
          deleted = true;
        }
      }

      return { success: deleted, path: normalized };
    } catch (err: unknown) {
      return { success: false, path: filePath, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
