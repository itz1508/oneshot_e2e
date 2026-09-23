/**
 * OneShot CompositeBackend — Prefix-Routed Filesystem for Deep Agents
 *
 * Implements the CompositeBackend router pattern per:
 * https://docs.langchain.com/oss/python/deepagents/backends#compositebackend-router
 *
 * Characteristics:
 * - Routes file operations to specific backends based on path prefix.
 * - Longer prefix matches win (e.g., "/workspace/src/" overrides "/workspace/").
 * - Keeps internal agent data (e.g. /scratch/, /large_tool_results/) in ephemeral
 *   StateBackend storage while routing real project code to FilesystemBackend or Sandbox.
 * - Aggregates listings and search results (ls, glob, grep) seamlessly, preserving
 *   original route prefixes.
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

export interface CompositeBackendOptions {
  default: BackendProtocol;
  routes?: Record<string, BackendProtocol>;
}

export class CompositeBackend implements BackendProtocol {
  readonly name = "CompositeBackend";
  readonly defaultBackend: BackendProtocol;
  readonly routes: Map<string, BackendProtocol>;

  constructor(options: CompositeBackendOptions) {
    this.defaultBackend = options.default;
    this.routes = new Map();

    if (options.routes) {
      // Sort routes by prefix length descending so longer prefixes match first
      const sortedEntries = Object.entries(options.routes).sort(
        (a, b) => b[0].length - a[0].length
      );
      for (const [prefix, backend] of sortedEntries) {
        const normalized = this.normalizePrefix(prefix);
        this.routes.set(normalized, backend);
      }
    }
  }

  private normalizePrefix(prefix: string): string {
    const cleaned = prefix.replace(/\\/g, "/");
    const withLead = cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
    return withLead.endsWith("/") ? withLead : `${withLead}/`;
  }

  private normalizePath(p: string): string {
    const cleaned = p.replace(/\\/g, "/");
    return cleaned.startsWith("/") ? cleaned : `/${cleaned}`;
  }

  /**
   * Resolves the target backend and the sub-path relative to that backend's mount point.
   */
  resolveRoute(filePath: string): { backend: BackendProtocol; subPath: string; prefix?: string } {
    const normalized = this.normalizePath(filePath);

    for (const [prefix, backend] of this.routes.entries()) {
      if (normalized.startsWith(prefix) || normalized === prefix.slice(0, -1)) {
        // Relative subpath inside that backend's namespace
        const subPath = normalized.slice(prefix.length - 1); // keep leading '/'
        return { backend, subPath: subPath || "/", prefix };
      }
    }

    return { backend: this.defaultBackend, subPath: normalized };
  }

  async ls(dirPath: string): Promise<LsResult> {
    const normalized = this.normalizePath(dirPath);

    // If listing root '/', aggregate from default backend and top-level route mounts
    if (normalized === "/") {
      const defaultRes = await this.defaultBackend.ls("/");
      const rootEntries = [...defaultRes.entries];

      for (const prefix of this.routes.keys()) {
        const seg = prefix.split("/").filter(Boolean)[0];
        if (seg && !rootEntries.some((e) => e.name === seg)) {
          rootEntries.push({
            path: `/${seg}`,
            name: seg,
            isDir: true,
          });
        }
      }

      return { entries: rootEntries, error: defaultRes.error };
    }

    const { backend, subPath, prefix } = this.resolveRoute(dirPath);
    const res = await backend.ls(subPath);

    if (prefix && res.entries) {
      // Re-prefix entries with the composite route prefix
      const remapped = res.entries.map((entry) => ({
        ...entry,
        path: entry.path.startsWith("/")
          ? `${prefix.slice(0, -1)}${entry.path}`
          : `${prefix}${entry.path}`,
      }));
      return { entries: remapped, error: res.error };
    }

    return res;
  }

  async read(filePath: string, offset = 0, limit?: number): Promise<ReadResult> {
    const { backend, subPath } = this.resolveRoute(filePath);
    return backend.read(subPath, offset, limit);
  }

  async write(filePath: string, content: string): Promise<WriteResult> {
    const { backend, subPath } = this.resolveRoute(filePath);
    const res = await backend.write(subPath, content);
    return {
      ...res,
      path: filePath,
    };
  }

  async edit(
    filePath: string,
    oldString: string,
    newString: string,
    replaceAll = false
  ): Promise<EditResult> {
    const { backend, subPath } = this.resolveRoute(filePath);
    const res = await backend.edit(subPath, oldString, newString, replaceAll);
    return {
      ...res,
      path: filePath,
    };
  }

  async glob(pattern: string, pathPrefix = "/"): Promise<GlobResult> {
    const allMatches: string[] = [];

    // Query default backend
    const defRes = await this.defaultBackend.glob(pattern, pathPrefix);
    if (defRes.matches) allMatches.push(...defRes.matches);

    // Query routed backends
    for (const [prefix, backend] of this.routes.entries()) {
      const routeRes = await backend.glob(pattern, "/");
      if (routeRes.matches) {
        for (const m of routeRes.matches) {
          const remapped = m.startsWith("/")
            ? `${prefix.slice(0, -1)}${m}`
            : `${prefix}${m}`;
          allMatches.push(remapped);
        }
      }
    }

    return { matches: Array.from(new Set(allMatches)) };
  }

  async grep(pattern: string, pathPrefix = "/"): Promise<GrepResult> {
    const allMatches: GrepMatch[] = [];

    // Query default backend
    const defRes = await this.defaultBackend.grep(pattern, pathPrefix);
    if (defRes.matches) allMatches.push(...defRes.matches);

    // Query routed backends
    for (const [prefix, backend] of this.routes.entries()) {
      const routeRes = await backend.grep(pattern, "/");
      if (routeRes.matches) {
        for (const m of routeRes.matches) {
          const remappedPath = m.path.startsWith("/")
            ? `${prefix.slice(0, -1)}${m.path}`
            : `${prefix}${m.path}`;
          allMatches.push({
            ...m,
            path: remappedPath,
          });
        }
      }
    }

    return { matches: allMatches };
  }

  async delete(filePath: string): Promise<DeleteResult> {
    const { backend, subPath } = this.resolveRoute(filePath);
    if (backend.delete) {
      const res = await backend.delete(subPath);
      return { ...res, path: filePath };
    }
    return { success: false, path: filePath, error: "Delete not supported on target backend" };
  }
}
