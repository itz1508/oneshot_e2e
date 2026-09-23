/**
 * OneShot FilesystemBackend — Sandboxed Local Disk Filesystem for Deep Agents
 *
 * Implements the FilesystemBackend pattern per:
 * https://docs.langchain.com/oss/python/deepagents/backends#filesystembackend-local-disk
 *
 * Characteristics:
 * - Reads and writes real files on disk under a configurable rootDir.
 * - Always enforces virtual_mode=true: strictly validates and sandboxes paths
 *   under rootDir, blocking path traversal (../, ~/, or absolute escapes).
 * - Implements ls, read, write, edit, glob, grep, and delete.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
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

export interface FilesystemBackendOptions {
  rootDir: string;
  virtualMode?: boolean;
}

export class FilesystemBackend implements BackendProtocol {
  readonly name = "FilesystemBackend";
  readonly rootDir: string;
  readonly virtualMode: boolean;

  constructor(options: FilesystemBackendOptions) {
    this.rootDir = path.resolve(options.rootDir);
    this.virtualMode = options.virtualMode ?? true;
  }

  /**
   * Resolves and verifies that the requested path is safely contained within rootDir.
   * Throws an error if path traversal or escape is attempted when virtualMode is true.
   */
  resolveSafePath(requestedPath: string): string {
    const sanitized = requestedPath.replace(/^[/\\]+/, "");
    const resolved = path.resolve(this.rootDir, sanitized);

    if (this.virtualMode) {
      const relative = path.relative(this.rootDir, resolved);
      if (relative.startsWith("..") || path.isAbsolute(relative)) {
        throw new Error(`Security Violation: Path '${requestedPath}' escapes allowed root directory`);
      }
    }

    return resolved;
  }

  async ls(dirPath: string): Promise<LsResult> {
    try {
      const resolvedDir = this.resolveSafePath(dirPath);
      const dirents = await fs.readdir(resolvedDir, { withFileTypes: true });

      const entries: FileEntry[] = await Promise.all(
        dirents.map(async (d) => {
          const entryPath = path.join(resolvedDir, d.name);
          const relPath = "/" + path.relative(this.rootDir, entryPath).replace(/\\/g, "/");
          let sizeBytes: number | undefined;
          let modifiedAt: string | undefined;

          try {
            const stat = await fs.stat(entryPath);
            sizeBytes = stat.isDirectory() ? undefined : stat.size;
            modifiedAt = stat.mtime.toISOString();
          } catch {
            // Ignore stat errors for inaccessible entries
          }

          return {
            path: relPath,
            name: d.name,
            isDir: d.isDirectory(),
            sizeBytes,
            modifiedAt,
          };
        })
      );

      return { entries };
    } catch (err: unknown) {
      return { entries: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  async read(filePath: string, offset = 0, limit?: number): Promise<ReadResult> {
    try {
      const resolved = this.resolveSafePath(filePath);
      const content = await fs.readFile(resolved, "utf8");
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
      const resolved = this.resolveSafePath(filePath);
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, content, "utf8");

      return {
        success: true,
        path: filePath,
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
      const resolved = this.resolveSafePath(filePath);
      const content = await fs.readFile(resolved, "utf8");

      if (!content.includes(oldString)) {
        return { success: false, path: filePath, error: `Target substring not found in ${filePath}` };
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

      await fs.writeFile(resolved, newContent, "utf8");
      return { success: true, path: filePath, replacementsCount: count };
    } catch (err: unknown) {
      return { success: false, path: filePath, error: err instanceof Error ? err.message : String(err) };
    }
  }

  async glob(pattern: string, pathPrefix = "/"): Promise<GlobResult> {
    try {
      const resolvedBase = this.resolveSafePath(pathPrefix);
      const matches: string[] = [];

      const walk = async (currentDir: string) => {
        const dirents = await fs.readdir(currentDir, { withFileTypes: true });
        for (const dirent of dirents) {
          const fullPath = path.join(currentDir, dirent.name);
          const relPath = "/" + path.relative(this.rootDir, fullPath).replace(/\\/g, "/");

          if (dirent.isDirectory()) {
            await walk(fullPath);
          } else {
            // Simplified regex check
            const regexStr = pattern
              .replace(/\./g, "\\.")
              .replace(/\*\*/g, ".*")
              .replace(/(?<!\.)\*/g, "[^/]*")
              .replace(/\?/g, ".");
            if (new RegExp(`^${regexStr}$`).test(relPath) || new RegExp(`^${regexStr}$`).test(dirent.name)) {
              matches.push(relPath);
            }
          }
        }
      };

      await walk(resolvedBase);
      return { matches };
    } catch (err: unknown) {
      return { matches: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  async grep(pattern: string, pathPrefix = "/"): Promise<GrepResult> {
    try {
      const resolvedBase = this.resolveSafePath(pathPrefix);
      const matches: GrepMatch[] = [];

      const walk = async (currentDir: string) => {
        const dirents = await fs.readdir(currentDir, { withFileTypes: true });
        for (const dirent of dirents) {
          const fullPath = path.join(currentDir, dirent.name);
          const relPath = "/" + path.relative(this.rootDir, fullPath).replace(/\\/g, "/");

          if (dirent.isDirectory()) {
            await walk(fullPath);
          } else {
            try {
              const content = await fs.readFile(fullPath, "utf8");
              const lines = content.split("\n");
              lines.forEach((line, index) => {
                if (line.includes(pattern)) {
                  matches.push({
                    path: relPath,
                    lineNumber: index + 1,
                    lineContent: line,
                  });
                }
              });
            } catch {
              // Skip unreadable files
            }
          }
        }
      };

      await walk(resolvedBase);
      return { matches };
    } catch (err: unknown) {
      return { matches: [], error: err instanceof Error ? err.message : String(err) };
    }
  }

  async delete(filePath: string): Promise<DeleteResult> {
    try {
      const resolved = this.resolveSafePath(filePath);
      const stat = await fs.stat(resolved);

      if (stat.isDirectory()) {
        await fs.rm(resolved, { recursive: true, force: true });
      } else {
        await fs.unlink(resolved);
      }

      return { success: true, path: filePath };
    } catch (err: unknown) {
      return { success: false, path: filePath, error: err instanceof Error ? err.message : String(err) };
    }
  }
}
