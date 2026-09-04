import { lstat, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  extname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const DENIED_DIRECTORY_NAMES = new Set([
  ".git",
  ".venv",
  "node_modules",
  "data",
  "dist",
  ".ollama",
  ".pytest_cache",
  "__pycache__",
]);
const DENIED_PRIVATE_KEY_EXTENSIONS = new Set([
  ".pem",
  ".key",
  ".p12",
  ".pfx",
]);
const PUBLIC_ENV_TEMPLATE_DIRECTORY = "app/env";
const PUBLIC_ENV_TEMPLATE_NAMES = new Set([
  ".env.example",
  ".env.workspace.example",
]);

export class WorkspacePathTraversalError extends Error {
  constructor() {
    super("path must stay within the workspace root");
    this.name = "WorkspacePathTraversalError";
  }
}

export class WorkspacePathDeniedError extends Error {
  constructor(message = "workspace path is denied by security policy") {
    super(message);
    this.name = "WorkspacePathDeniedError";
  }
}

function relativeParts(relativePath: string): string[] {
  return relativePath
    .split(/[\\/]+/)
    .filter((part) => part.length > 0 && part !== ".");
}

export function isSensitiveWorkspacePath(relativePath: string): boolean {
  const parts = relativeParts(relativePath);
  if (parts.length === 0) return false;

  const lowered = parts.map((part) => part.toLowerCase());
  if (
    lowered.length === 3 &&
    lowered[0] === "app" &&
    lowered[1] === "env" &&
    PUBLIC_ENV_TEMPLATE_NAMES.has(lowered[2])
  ) {
    return false;
  }

  return lowered.some((part) => {
    if (DENIED_DIRECTORY_NAMES.has(part)) return true;
    if (part === ".env" || part.startsWith(".env.")) return true;
    if (part.startsWith("credentials") || part.startsWith("secrets")) {
      return true;
    }
    return DENIED_PRIVATE_KEY_EXTENSIONS.has(extname(part).toLowerCase());
  });
}

function isContained(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return (
    fromRoot !== ".." &&
    !fromRoot.startsWith(`..${sep}`) &&
    !isAbsolute(fromRoot)
  );
}

export class WorkspacePathPolicy {
  private constructor(private readonly root: string) {}

  static async create(workspaceRoot: string): Promise<WorkspacePathPolicy> {
    return new WorkspacePathPolicy(await realpath(resolve(workspaceRoot)));
  }

  private lexical(requestedPath: string): { target: string; relativePath: string } {
    const target = resolve(this.root, requestedPath);
    if (!isContained(this.root, target)) throw new WorkspacePathTraversalError();
    const relativePath = relative(this.root, target);
    if (isSensitiveWorkspacePath(relativePath)) {
      throw new WorkspacePathDeniedError();
    }
    return { target, relativePath };
  }

  private async assertNoSymlinks(target: string): Promise<void> {
    const fromRoot = relative(this.root, target);
    let current = this.root;
    for (const part of relativeParts(fromRoot)) {
      current = resolve(current, part);
      try {
        const status = await lstat(current);
        if (status.isSymbolicLink()) {
          throw new WorkspacePathDeniedError("workspace symlinks are denied");
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
        throw error;
      }
    }
  }

  private assertCanonical(canonicalPath: string): void {
    if (!isContained(this.root, canonicalPath)) {
      throw new WorkspacePathDeniedError("workspace path resolves outside the workspace root");
    }
    if (isSensitiveWorkspacePath(relative(this.root, canonicalPath))) {
      throw new WorkspacePathDeniedError();
    }
  }

  async authorizeExisting(requestedPath: string): Promise<string> {
    const { target } = this.lexical(requestedPath);
    await this.assertNoSymlinks(target);
    const canonical = await realpath(target);
    this.assertCanonical(canonical);
    return canonical;
  }

  async authorizeWrite(requestedPath: string): Promise<string> {
    const { target } = this.lexical(requestedPath);
    await this.assertNoSymlinks(target);

    const canonicalParent = await realpath(dirname(target));
    this.assertCanonical(canonicalParent);

    try {
      const canonicalTarget = await realpath(target);
      this.assertCanonical(canonicalTarget);
      return canonicalTarget;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      return resolve(canonicalParent, basename(target));
    }
  }
}
