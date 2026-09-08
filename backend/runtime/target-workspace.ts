import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, relative, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { RuntimePaths } from "./runtime-config.js";

const run = promisify(execFile);

/**
 * Target workspace selection and upload materialization (§11–12).
 *
 * OneShot operates on an explicitly selected target project workspace. The
 * `ONESHOT_WORKSPACE_ROOT || projectRoot` fallback is only legitimate when it
 * is the intentional local/demo target; this service records which target is
 * actually selected so the UI can present real provenance instead of silently
 * presenting OneShot's own root as the user's project.
 *
 * Uploads: an out-of-band receiver stores the uploaded archive in
 * `runtimePaths.uploads`; materialization extracts it into
 * `runtimePaths.targetWorkspace` and validates that no entry escaped the root.
 * Extraction uses the system `tar` (bsdtar on Windows/macOS also reads .zip;
 * GNU tar on Linux reads .tar/.tar.gz/.tgz). No new npm dependencies.
 */
export class TargetWorkspaceError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export type TargetSource = "upload" | "workspace-root" | "project-root-fallback";

export interface TargetWorkspaceInfo {
  /** Absolute path of the materialized target workspace root. */
  root: string;
  source: TargetSource;
  /** True: explicitly selected by the user/demo mode. Never a silent fallback. */
  explicit: boolean;
  file_count: number;
  total_bytes: number;
  /** sha256 over materialized paths + contents, for run provenance. */
  digest: string;
  upload_name?: string;
  created_at: string;
}

const INFO_NAME = "target-workspace.info";

async function treeStats(root: string): Promise<{ files: string[]; bytes: number }> {
  const files: string[] = [];
  let bytes = 0;
  async function walk(dir: string): Promise<void> {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      // Extraction-escape guard: every materialized path must stay inside root.
      if (relative(root, full).startsWith("..")) {
        throw new TargetWorkspaceError("Archive entry escapes the target workspace root", 400);
      }
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        files.push(full);
        bytes += (await stat(full)).size;
      }
    }
  }
  await walk(root);
  return { files, bytes };
}

async function digestTree(root: string, files: string[]): Promise<string> {
  const hash = createHash("sha256");
  for (const file of [...files].sort()) {
    hash.update(relative(root, file).replaceAll("\\", "/"));
    hash.update("\0");
    hash.update(await readFile(file));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function writeInfo(paths: RuntimePaths, info: TargetWorkspaceInfo): Promise<void> {
  await mkdir(paths.targetWorkspace, { recursive: true });
  await writeFile(join(paths.targetWorkspace, INFO_NAME), JSON.stringify(info, null, 2) + "\n", "utf8");
}

class TargetWorkspaceService {
  constructor(private paths: RuntimePaths) {}

  /** Materialize an uploaded archive from `runtimePaths.uploads` into the target workspace. */
  async materializeUpload(uploadName: string): Promise<TargetWorkspaceInfo> {
    const clean = basename(String(uploadName || ""));
    if (!clean || clean.startsWith(".")) {
      throw new TargetWorkspaceError("Provide the name of an uploaded archive file", 400);
    }
    const uploadsRoot = resolve(this.paths.uploads);
    const uploadPath = resolve(uploadsRoot, clean);
    if (!uploadPath.startsWith(uploadsRoot + sep)) {
      throw new TargetWorkspaceError("Upload path escapes the uploads directory", 400);
    }
    try { await stat(uploadPath); }
    catch { throw new TargetWorkspaceError(`Uploaded archive not found: ${clean}`, 404); }

    const root = this.paths.targetWorkspace;
    // Never mix materializations: clear the previous target before extracting.
    await rm(root, { recursive: true, force: true });
    await mkdir(root, { recursive: true });
    try {
      await run("tar", ["-xf", uploadPath, "-C", root]);
    } catch (error: any) {
      await rm(root, { recursive: true, force: true });
      const detail = String(error?.stderr || error?.message || error);
      throw new TargetWorkspaceError(
        /zip/.test(clean) && !/bsdtar/i.test(detail)
          ? `Failed to extract upload (this platform's tar may not support .zip): ${detail}`
          : `Failed to extract upload: ${detail}`,
        400,
      );
    }
    const { files, bytes } = await treeStats(root);
    if (files.length === 0) {
      await rm(root, { recursive: true, force: true });
      throw new TargetWorkspaceError("Uploaded archive is empty", 400);
    }
    const info: TargetWorkspaceInfo = {
      root,
      source: "upload",
      explicit: true,
      file_count: files.length,
      total_bytes: bytes,
      digest: await digestTree(root, files),
      upload_name: clean,
      created_at: new Date().toISOString(),
    };
    await writeInfo(this.paths, info);
    return info;
  }

  /**
   * Record an explicit non-upload target: an intentionally selected
   * ONESHOT_WORKSPACE_ROOT, or the established local/demo projectRoot fallback
   * (§11.2 — permitted only when explicitly the selected target/demo mode).
   */
  async selectExisting(source: Exclude<TargetSource, "upload">, root: string): Promise<TargetWorkspaceInfo> {
    const target = resolve(root);
    await mkdir(target, { recursive: true });
    const { files, bytes } = await treeStats(target);
    const info: TargetWorkspaceInfo = {
      root: target,
      source,
      explicit: true,
      file_count: files.length,
      total_bytes: bytes,
      digest: await digestTree(target, files),
      created_at: new Date().toISOString(),
    };
    await writeInfo(this.paths, info);
    return info;
  }

  /** Current explicit target, if one has been selected. */
  async current(): Promise<TargetWorkspaceInfo | undefined> {
    try {
      return JSON.parse(await readFile(join(this.paths.targetWorkspace, INFO_NAME), "utf8")) as TargetWorkspaceInfo;
    } catch (error: any) {
      if (error.code === "ENOENT") return undefined;
      throw error;
    }
  }
}

export { TargetWorkspaceService };
