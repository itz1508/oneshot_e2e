/**
 * OneShot Agent Runtime — Versioned Git & GitHub Storage Types
 *
 * Adheres strictly to the Strands Agents SDK Storage interface:
 * https://strandsagents.com/docs/user-guide/sdk/storage/
 */

import type { Storage } from "@strands-agents/sdk/storage";

export type StrandsStorage = Storage;

export interface GitHubStorageConfig {
  owner: string;
  repo: string;
  branch?: string;
  pathPrefix?: string;
  token?: string;
  commitAuthor?: {
    name: string;
    email: string;
  };
}

export interface GitSnapshotMetadata {
  id: string;
  timestamp: string;
  stage: string;
  restorePoint?: string;
  verifiedPackageHash?: string;
  commitSha?: string;
  message?: string;
}

export interface GitDiffEntry {
  key: string;
  status: "added" | "modified" | "deleted";
  oldSize?: number;
  newSize?: number;
}
