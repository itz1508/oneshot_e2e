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

  private async readJsonResponse<T extends Record<string, unknown>>(response: Response, operation: string): Promise<T> {
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`${operation} returned non-JSON content (HTTP ${response.status})`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch (error) {
      throw new Error(`${operation} returned invalid JSON: ${error instanceof Error ? error.message : "parse error"}`);
    }
    if (!response.ok) {
      const message = payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
        ? payload.message
        : `${operation} failed with HTTP ${response.status}`;
      throw new Error(message);
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error(`${operation} response must be a JSON object`);
    }
    return payload as T;
  }

  private isResponseContractError(error: unknown): boolean {
    return error instanceof Error && error.message.startsWith("GitHub ") &&
      (error.message.includes(" response") || error.message.includes(" returned"));
  }

  async write(key: string, data: Uint8Array): Promise<void> {
    if (!this.isOnline) {
      return this.fallbackStorage.write(key, data);
    }

    const repoPath = this.resolveRepoPath(key);
    const url = `https://api.github.com/repos/${this.config.owner}/${this.config.repo}/contents/${repoPath}`;
    const contentBase64 = Buffer.from(data).toString("base64");

    // Check if file already exists to get SHA for updates.
    let sha: string | undefined;
    let getRes: Response;
    try {
      getRes = await fetch(`${url}?ref=${this.config.branch}`, { headers: this.headers });
    } catch {
      await this.fallbackStorage.write(key, data);
      return;
    }
    if (getRes.ok) {
      const json = await this.readJsonResponse<{ sha?: string }>(getRes, "GitHub content lookup");
      if (typeof json.sha !== "string" || !json.sha) throw new Error("GitHub content lookup response is missing sha");
      sha = json.sha;
    } else if (getRes.status !== 404) {
      await this.fallbackStorage.write(key, data);
      return;
    }

    const payload: Record<string, unknown> = {
      message: `[OneShot Storage] Update ${key}`,
      content: contentBase64,
      branch: this.config.branch,
      ...(sha ? { sha } : {}),
      ...(this.config.commitAuthor ? { author: this.config.commitAuthor } : {}),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        method: "PUT",
        headers: this.headers,
        body: JSON.stringify(payload),
      });
    } catch {
      await this.fallbackStorage.write(key, data);
      return;
    }
    if (!res.ok) {
      await this.fallbackStorage.write(key, data);
      return;
    }
    const commit = await this.readJsonResponse<{ content?: { sha?: string; path?: string }; commit?: { sha?: string } }>(res, "GitHub content write");
    if (typeof commit.content?.sha !== "string" || !commit.content.sha || typeof commit.commit?.sha !== "string" || !commit.commit.sha || commit.content?.path !== repoPath) {
      throw new Error("GitHub content write response did not confirm the content and commit SHAs");
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
      if (!res.ok) return this.fallbackStorage.read(key);
      const json = await this.readJsonResponse<{ content?: string; encoding?: string; sha?: string; path?: string }>(res, "GitHub content read");
      if (json.path !== repoPath || typeof json.sha !== "string" || !json.sha || json.encoding !== "base64" || typeof json.content !== "string") {
        throw new Error("GitHub content read response failed its path/sha/base64 contract");
      }
      const clean = json.content.replace(/\n/g, "");
      if (clean.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(clean)) {
        throw new Error("GitHub content read response contains invalid base64");
      }
      return new Uint8Array(Buffer.from(clean, "base64"));
    } catch (error) {
      if (this.isResponseContractError(error)) throw error;
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
        await this.fallbackStorage.delete(key);
        return;
      }
      const json = await this.readJsonResponse<{ sha?: string; path?: string }>(getRes, "GitHub delete lookup");
      if (json.path !== repoPath || typeof json.sha !== "string" || !json.sha) throw new Error("GitHub delete lookup response is missing path or sha");

      const deleteRes = await fetch(url, {
        method: "DELETE",
        headers: this.headers,
        body: JSON.stringify({
          message: `[OneShot Storage] Delete ${key}`,
          sha: json.sha,
          branch: this.config.branch,
        }),
      });
      if (!deleteRes.ok) {
        await this.fallbackStorage.delete(key);
        return;
      }
      const commit = await this.readJsonResponse<{ commit?: { sha?: string } }>(deleteRes, "GitHub content delete");
      if (typeof commit.commit?.sha !== "string" || !commit.commit.sha) throw new Error("GitHub content delete response is missing commit sha");
    } catch (error) {
      if (this.isResponseContractError(error)) throw error;
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
      if (!res.ok) return this.fallbackStorage.list(prefixQuery);
      const json = await this.readJsonResponse<{ tree?: Array<{ path: string; type: string }>; truncated?: boolean }>(res, "GitHub tree listing");
      if (json.truncated === true) throw new Error("GitHub tree listing response is truncated; refusing an incomplete result");
      if (!Array.isArray(json.tree) || !json.tree.every((item) => item && typeof item.path === "string" && typeof item.type === "string")) {
        throw new Error("GitHub tree listing response is missing valid tree entries");
      }

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
    } catch (error) {
      if (this.isResponseContractError(error)) throw error;
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
