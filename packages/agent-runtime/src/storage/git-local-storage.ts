/**
 * OneShot Agent Runtime — Offline-First Versioned Git Storage Backend
 *
 * Implements the Strands Storage interface persisting state into .oneshot/storage/.
 * Supports atomic snapshotting, diff calculation, and namespaces.
 */

import type { Storage } from "@strands-agents/sdk/storage";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { GitDiffEntry, GitSnapshotMetadata } from "./types.js";

export class GitLocalStorage implements Storage {
  readonly rootDir: string;
  readonly prefix: string;

  constructor(options?: { rootDir?: string; prefix?: string }) {
    this.rootDir = path.resolve(options?.rootDir || ".oneshot/storage");
    this.prefix = options?.prefix || "";
  }

  private resolveKeyPath(key: string): string {
    const fullKey = this.prefix ? `${this.prefix}/${key}`.replace(/\/+/g, "/") : key;
    const safeKey = fullKey.replace(/^(\.\.(\/|\\|$))+/, "").replace(/^[/\\]+/, "");
    return path.join(this.rootDir, "objects", safeKey);
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, data);
  }

  async read(key: string): Promise<Uint8Array | null> {
    const filePath = this.resolveKeyPath(key);
    try {
      const buffer = await fs.readFile(filePath);
      return new Uint8Array(buffer);
    } catch (err: any) {
      if (err.code === "ENOENT") return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const filePath = this.resolveKeyPath(key);
    try {
      await fs.unlink(filePath);
    } catch (err: any) {
      if (err.code !== "ENOENT") throw err;
    }
  }

  async list(prefixQuery: string = ""): Promise<string[]> {
    const baseDir = path.join(this.rootDir, "objects");
    const results: string[] = [];

    const walk = async (currentDir: string, relativePath: string) => {
      let entries: string[];
      try {
        entries = await fs.readdir(currentDir);
      } catch (err: any) {
        if (err.code === "ENOENT") return;
        throw err;
      }

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry);
        const rel = relativePath ? `${relativePath}/${entry}` : entry;
        const stat = await fs.stat(fullPath);
        if (stat.isDirectory()) {
          await walk(fullPath, rel);
        } else {
          results.push(rel.replace(/\\/g, "/"));
        }
      }
    };

    await walk(baseDir, "");

    const activePrefix = this.prefix
      ? `${this.prefix}/${prefixQuery}`.replace(/\/+/g, "/").replace(/^\/+/, "")
      : prefixQuery;

    const filtered = results.filter((k) => k.startsWith(activePrefix));

    if (this.prefix) {
      const p = this.prefix.endsWith("/") ? this.prefix : `${this.prefix}/`;
      return filtered.map((k) => (k.startsWith(p) ? k.slice(p.length) : k)).sort();
    }

    return filtered.sort();
  }

  namespace(prefix: string): Storage {
    const combinedPrefix = this.prefix ? `${this.prefix}/${prefix}`.replace(/\/+/g, "/") : prefix;
    return new GitLocalStorage({
      rootDir: this.rootDir,
      prefix: combinedPrefix,
    });
  }

  async clear(): Promise<void> {
    const baseDir = this.prefix
      ? path.join(this.rootDir, "objects", this.prefix)
      : path.join(this.rootDir, "objects");
    try {
      await fs.rm(baseDir, { recursive: true, force: true });
    } catch {
      // Ignore if directory doesn't exist
    }
  }

  // --- Snapshotting & Diff Extensions ---

  async createSnapshot(metadata?: Partial<GitSnapshotMetadata>): Promise<GitSnapshotMetadata> {
    const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const snapshotMeta: GitSnapshotMetadata = {
      id: snapshotId,
      timestamp: new Date().toISOString(),
      stage: metadata?.stage || "checkpoint",
      restorePoint: metadata?.restorePoint,
      verifiedPackageHash: metadata?.verifiedPackageHash,
      message: metadata?.message || `Checkpoint snapshot at stage ${metadata?.stage || "unknown"}`,
    };

    const keys = await this.list();
    const manifest: Record<string, { size: number }> = {};

    for (const key of keys) {
      const data = await this.read(key);
      if (data) {
        manifest[key] = { size: data.byteLength };
        // Save to snapshot directory
        const snapPath = path.join(this.rootDir, "snapshots", snapshotId, "data", key);
        await fs.mkdir(path.dirname(snapPath), { recursive: true });
        await fs.writeFile(snapPath, data);
      }
    }

    const metaPath = path.join(this.rootDir, "snapshots", snapshotId, "metadata.json");
    await fs.mkdir(path.dirname(metaPath), { recursive: true });
    await fs.writeFile(metaPath, JSON.stringify({ metadata: snapshotMeta, manifest }, null, 2));

    return snapshotMeta;
  }

  async listSnapshots(): Promise<GitSnapshotMetadata[]> {
    const snapDir = path.join(this.rootDir, "snapshots");
    try {
      const dirs = await fs.readdir(snapDir);
      const snapshots: GitSnapshotMetadata[] = [];
      for (const d of dirs) {
        try {
          const metaContent = await fs.readFile(path.join(snapDir, d, "metadata.json"), "utf8");
          const parsed = JSON.parse(metaContent);
          if (parsed.metadata) snapshots.push(parsed.metadata);
        } catch {
          // ignore corrupted snapshot metadata
        }
      }
      return snapshots.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    } catch {
      return [];
    }
  }

  async compareSnapshots(
    oldSnapshotId: string,
    newSnapshotId: string
  ): Promise<GitDiffEntry[]> {
    const snapDir = path.join(this.rootDir, "snapshots");
    const oldMeta = JSON.parse(
      await fs.readFile(path.join(snapDir, oldSnapshotId, "metadata.json"), "utf8")
    );
    const newMeta = JSON.parse(
      await fs.readFile(path.join(snapDir, newSnapshotId, "metadata.json"), "utf8")
    );

    const oldManifest: Record<string, { size: number }> = oldMeta.manifest || {};
    const newManifest: Record<string, { size: number }> = newMeta.manifest || {};

    const diffs: GitDiffEntry[] = [];
    const allKeys = new Set([...Object.keys(oldManifest), ...Object.keys(newManifest)]);

    for (const key of allKeys) {
      if (!oldManifest[key] && newManifest[key]) {
        diffs.push({ key, status: "added", newSize: newManifest[key].size });
      } else if (oldManifest[key] && !newManifest[key]) {
        diffs.push({ key, status: "deleted", oldSize: oldManifest[key].size });
      } else if (oldManifest[key] && newManifest[key]) {
        if (oldManifest[key].size !== newManifest[key].size) {
          diffs.push({
            key,
            status: "modified",
            oldSize: oldManifest[key].size,
            newSize: newManifest[key].size,
          });
        }
      }
    }

    return diffs;
  }
}
