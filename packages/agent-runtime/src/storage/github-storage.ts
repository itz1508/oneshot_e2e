/**
 * OneShot Agent Runtime — Remote GitHub Versioned Storage Backend
 *
 * Implements the Strands Storage interface persisting state into a GitHub repository.
 * Falls back to GitLocalStorage when offline or when GITHUB_TOKEN is not configured.
 */

import type { Storage } from "@strands-agents/sdk/storage";
import { GitLocalStorage } from "./git-local-storage.js";
import type { GitHubStorageConfig } from "./types.js";

export class GitHubStorage implements Storage {
  readonly config: GitHubStorageConfig;
  private readonly fallbackStorage: GitLocalStorage;
  private readonly isOnline: boolean;

  constructor(config: GitHubStorageConfig, options?: { localFallbackDir?: string }) {
    this.config = {
      ...config,
      token: config.token || process.env.GITHUB_TOKEN,
      branch: config.branch || "main",
      pathPrefix: config.pathPrefix || ".oneshot/storage",
    };

    this.fallbackStorage = new GitLocalStorage({
      rootDir: options?.localFallbackDir || ".oneshot/storage",
      prefix: this.config.pathPrefix,
    });

    // Enabled only when GITHUB_TOKEN is explicitly present
    this.isOnline = Boolean(this.config.token);
  }

  get isConfiguredRemote(): boolean {
    return this.isOnline;
  }

  private get headers(): Record<string, string> {
    return {
      Accept: "application/vnd.github.v3+json",
      Authorization: `Bearer ${this.config.token}`,
      "User-Agent": "OneShot-Agent-Runtime",
      "Content-Type": "application/json",
    };
  }

  private resolveRepoPath(key: string): string {
    const prefix = this.config.pathPrefix ? `${this.config.pathPrefix}/` : "";
    return `${prefix}${key}`.replace(/\/+/g, "/").replace(/^\/+/, "");
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    if (!this.isOnline) {
      return this.fallbackStorage.write(key, data);
    }

    const repoPath = this.resolveRepoPath(key);
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${repoPath}`;
    const contentBase64 = Buffer.from(data).toString("base64");

    // Check if file already exists to get SHA for updates
    let sha: string | undefined;
    try {
      const getRes = await fetch(`${url}?ref=${this.config.branch}`, {
        headers: this.headers,
      });
      if (getRes.ok) {
        const json = (await getRes.json()) as { sha?: string };
        sha = json.sha;
      }
    } catch {
      // ignore
    }

    const payload: Record<string, unknown> = {
      message: `[OneShot Storage] Update ${key}`,
      content: contentBase64,
      branch: this.config.branch,
      ...(sha ? { sha } : {}),
      ...(this.config.commitAuthor ? { author: this.config.commitAuthor } : {}),
    };

    const res = await fetch(url, {
      method: "PUT",
      headers: this.headers,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      // Fallback to local storage if network or auth error occurs
      await this.fallbackStorage.write(key, data);
    }
  }

  async read(key: string): Promise<Uint8Array | null> {
    if (!this.isOnline) {
      return this.fallbackStorage.read(key);
    }

    const repoPath = this.resolveRepoPath(key);
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${repoPath}?ref=${this.config.branch}`;

    try {
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.fallbackStorage.read(key);
      }
      const json = (await res.json()) as { content?: string; encoding?: string };
      if (json.content && json.encoding === "base64") {
        const clean = json.content.replace(/\n/g, "");
        return new Uint8Array(Buffer.from(clean, "base64"));
      }
      return null;
    } catch {
      return this.fallbackStorage.read(key);
    }
  }

  async delete(key: string): Promise<void> {
    if (!this.isOnline) {
      return this.fallbackStorage.delete(key);
    }

    const repoPath = this.resolveRepoPath(key);
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${repoPath}`;

    try {
      const getRes = await fetch(`${url}?ref=${this.config.branch}`, { headers: this.headers });
      if (!getRes.ok) {
        return this.fallbackStorage.delete(key);
      }
      const json = (await getRes.json()) as { sha?: string };
      if (!json.sha) return;

      await fetch(url, {
        method: "DELETE",
        headers: this.headers,
        body: JSON.stringify({
          message: `[OneShot Storage] Delete ${key}`,
          sha: json.sha,
          branch: this.config.branch,
        }),
      });
    } catch {
      await this.fallbackStorage.delete(key);
    }
  }

  async list(prefixQuery: string = ""): Promise<string[]> {
    if (!this.isOnline) {
      return this.fallbackStorage.list(prefixQuery);
    }

    // Use Git Trees API with recursive=1 for complete key listing
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/git/trees/${this.config.branch}?recursive=1`;

    try {
      const res = await fetch(url, { headers: this.headers });
      if (!res.ok) {
        return this.fallbackStorage.list(prefixQuery);
      }
      const json = (await res.json()) as { tree?: Array<{ path: string; type: string }> };
      if (!Array.isArray(json.tree)) return [];

      const prefix = this.resolveRepoPath(prefixQuery);
      const keys: string[] = [];

      for (const item of json.tree) {
        if (item.type === "blob" && item.path.startsWith(prefix)) {
          const stripped = this.config.pathPrefix
            ? item.path.replace(new RegExp(`^${this.config.pathPrefix}/?`), "")
            : item.path;
          keys.push(stripped);
        }
      }

      return keys.sort();
    } catch {
      return this.fallbackStorage.list(prefixQuery);
    }
  }

  namespace(prefix: string): Storage {
    const combinedPrefix = this.config.pathPrefix
      ? `${this.config.pathPrefix}/${prefix}`.replace(/\/+/g, "/")
      : prefix;

    return new GitHubStorage({
      ...this.config,
      pathPrefix: combinedPrefix,
    });
  }

  async clear(): Promise<void> {
    const keys = await this.list();
    for (const key of keys) {
      await this.delete(key);
    }
    await this.fallbackStorage.clear();
  }
}
