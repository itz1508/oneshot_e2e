/**
 * OneShot Runtime Directory Configuration
 *
 * Centralized runtime path resolution. All runtime-generated data
 * (runs, checkpoints, events, logs, artifacts) must be stored under
 * the runtime directory, never in source-controlled locations.
 *
 * Environment Override:
 *   ONESHOT_RUNTIME_DIR - Custom runtime directory path (default: .runtime)
 *
 * Directory Structure:
 *   .runtime/
 *   ├── runs/              - Run artifacts and evidence
 *   ├── run-state/         - Run snapshots
 *   ├── task-events/       - Event store
 *   ├── checkpoints/       - Task checkpoints
 *   ├── conversations/     - Intent conversations
 *   ├── sandbox-workspaces/ - Sandbox execution workspaces
 *   ├── cache/             - Cached data
 *   ├── qc/                - Quality control data
 *   └── uploads/           - Uploaded files
 */

import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Runtime directory paths
 */
export interface RuntimePaths {
  root: string;
  runs: string;
  runState: string;
  taskEvents: string;
  checkpoints: string;
  conversations: string;
  sandboxWorkspaces: string;
  cache: string;
  uploads: string;
  qc: string;
  /** `.runtime/config/` — non-secret runtime config (e.g. provider selections). */
  config: string;
}

/**
 * Resolve runtime directory from environment or default
 */
export function resolveRuntimeRoot(projectRoot: string): string {
  const envRoot = process.env.ONESHOT_RUNTIME_DIR;
  if (envRoot) {
    return resolve(envRoot);
  }
  return resolve(projectRoot, ".runtime");
}

/**
 * Get runtime paths for the application
 */
export function getRuntimePaths(projectRoot?: string): RuntimePaths {
  const root = projectRoot
    ? resolveRuntimeRoot(projectRoot)
    : resolveRuntimeRoot(process.env.ONESHOT_ROOT || process.cwd());

  return {
    root,
    runs: resolve(root, "runs"),
    runState: resolve(root, "run-state"),
    taskEvents: resolve(root, "task-events"),
    checkpoints: resolve(root, "checkpoints"),
    conversations: resolve(root, "conversations"),
    sandboxWorkspaces: resolve(root, "sandbox-workspaces"),
        cache: resolve(root, "cache"),
    uploads: resolve(root, "uploads"),
    qc: resolve(root, "qc"),
    config: resolve(root, "config"),
  };
}

/**
 * Ensure runtime directories exist
 */
export function ensureRuntimeDirectories(paths?: RuntimePaths): RuntimePaths {
  const runtimePaths = paths || getRuntimePaths();

  const dirs = [
    runtimePaths.runs,
    runtimePaths.runState,
    runtimePaths.taskEvents,
    runtimePaths.checkpoints,
    runtimePaths.conversations,
    runtimePaths.sandboxWorkspaces,
        runtimePaths.cache,
    runtimePaths.uploads,
    runtimePaths.qc,
    runtimePaths.config,
  ];

  for (const dir of dirs) {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  return runtimePaths;
}
