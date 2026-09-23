/**
 * OneShot Frontend DeepAgents Filesystem Backends Model
 *
 * Implements frontend projection of the pluggable backends architecture per:
 * https://docs.langchain.com/oss/python/deepagents/backends
 *
 * Exposes:
 * - Composite routed backend definition (/workspace/, /scratch/, /memories/, /artifacts/)
 * - Path safety and virtual_mode sandbox guarantees
 * - File entry models for interactive UI browsing
 */

export type BackendType = "state" | "filesystem" | "store" | "composite";

export interface BackendPartition {
  prefix: string;
  name: string;
  type: BackendType;
  description: string;
  ephemeral: boolean;
  durable: boolean;
  virtualMode: boolean;
}

export const CANONICAL_BACKEND_PARTITIONS: BackendPartition[] = [
  {
    prefix: "/workspace/",
    name: "User Workspace",
    type: "filesystem",
    description: "Physical project files isolated within the designated root directory with virtual_mode traversal protection.",
    ephemeral: false,
    durable: true,
    virtualMode: true,
  },
  {
    prefix: "/scratch/",
    name: "Ephemeral Scratchpad",
    type: "state",
    description: "Thread-scoped in-memory storage for intermediate subagent reasoning, offloaded large tool results, and drafts.",
    ephemeral: true,
    durable: false,
    virtualMode: true,
  },
  {
    prefix: "/memories/",
    name: "Cross-Thread Store",
    type: "store",
    description: "Durable persistent memories and user preferences isolated by tenant/thread namespace.",
    ephemeral: false,
    durable: true,
    virtualMode: true,
  },
  {
    prefix: "/artifacts/",
    name: "Confirmed Artifacts",
    type: "store",
    description: "Cryptographically bound packages (confirmed_package.core) verified before Builder execution.",
    ephemeral: false,
    durable: true,
    virtualMode: true,
  },
];

export interface ClientFileEntry {
  path: string;
  name: string;
  partition: string;
  isDir: boolean;
  sizeBytes?: number;
  modifiedAt?: string;
}

/**
 * Resolves which partition a path belongs to.
 */
export function resolvePartition(path: string): BackendPartition {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  for (const partition of CANONICAL_BACKEND_PARTITIONS) {
    if (normalized.startsWith(partition.prefix)) {
      return partition;
    }
  }
  // Default is scratchpad (StateBackend)
  return CANONICAL_BACKEND_PARTITIONS[1];
}
