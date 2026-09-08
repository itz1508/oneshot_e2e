import { readFile, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import {
  WorkspacePathDeniedError,
  WorkspacePathPolicy,
  WorkspacePathTraversalError,
} from "./workspace-path-policy.js";

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  size?: number;
  children?: TreeNode[];
}

export async function buildFileTree(
  policy: WorkspacePathPolicy,
  requestedDir: string,
  basePath = "",
  currentDepth = 0,
  maxDepth?: number,
): Promise<TreeNode[]> {
  if (maxDepth !== undefined && currentDepth >= maxDepth) return [];
  try {
    const dir = await policy.authorizeExisting(requestedDir);
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      const policyPath =
        requestedDir === "." ? entry.name : `${requestedDir}/${entry.name}`;

      try {
        await policy.authorizeExisting(policyPath);
      } catch (error) {
        if (
          error instanceof WorkspacePathDeniedError ||
          error instanceof WorkspacePathTraversalError
        ) {
          continue;
        }
        throw error;
      }

      if (entry.isDirectory()) {
        const children = await buildFileTree(
          policy,
          policyPath,
          relPath,
          currentDepth + 1,
          maxDepth,
        );
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "folder",
          children,
        });
      } else if (entry.isFile()) {
        const filePath = join(dir, entry.name);
        let size = 0;
        try {
          size = (await stat(filePath)).size;
        } catch {
          // If stat fails, leave size as 0 (file may have been deleted between readdir and stat)
        }
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "file",
          size,
        });
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    if (
      error instanceof WorkspacePathDeniedError ||
      error instanceof WorkspacePathTraversalError
    ) {
      throw error;
    }
    return [];
  }
}

interface WorkspaceInfo {
  root: string;
  source: "upload" | "workspace-root" | "project-root-fallback";
  explicit: boolean;
  file_count: number;
  total_bytes: number;
  digest: string;
  upload_name?: string;
  created_at: string;
}

export async function computeWorkspaceInfo(
  policy: WorkspacePathPolicy,
  workspaceRoot: string,
): Promise<WorkspaceInfo> {
  // Walk the workspace, respecting the same deny-list policy as buildFileTree.
  const files: string[] = [];
  let totalBytes = 0;

  async function walk(dir: string, relBase: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const relPath = relBase ? `${relBase}/${entry.name}` : entry.name;
      const policyPath = relPath;
      try {
        await policy.authorizeExisting(policyPath);
      } catch (error) {
        if (
          error instanceof WorkspacePathDeniedError ||
          error instanceof WorkspacePathTraversalError
        ) {
          continue;
        }
        throw error;
      }
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full, relPath);
      } else if (entry.isFile()) {
        files.push(full);
        try {
          totalBytes += (await stat(full)).size;
        } catch {
          // file vanished between readdir and stat
        }
      }
    }
  }

  await walk(workspaceRoot, "");

  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(relative(workspaceRoot, file).replaceAll("\\", "/"));
    hash.update("\0");
    try {
      hash.update(await readFile(file));
    } catch {
      // file vanished; contribute empty content
    }
    hash.update("\0");
  }

  return {
    root: workspaceRoot,
    source: "project-root-fallback",
    explicit: true,
    file_count: files.length,
    total_bytes: totalBytes,
    digest: hash.digest("hex"),
    created_at: new Date().toISOString(),
  };
}
