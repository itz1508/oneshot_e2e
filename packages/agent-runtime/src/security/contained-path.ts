/**
 * OneShot Contained Path Resolution
 *
 * Single authority for turning an untrusted, caller-supplied path into an
 * absolute path that is guaranteed to live inside an allowed root directory.
 *
 * Why this exists:
 * - `validateRealFixture` (backend/index.ts) resolved a request-body `path`
 *   directly against the process CWD, so any JSON file on the host could be
 *   read back through the API.
 * - The three vision tools resolved `filePath` / `outputPath` directly, so a
 *   model-chosen path could read or write outside the workspace.
 * - `FilesystemBackend` already implemented the correct check, but only on its
 *   own code path, so it was bypassed entirely by the HTTP tool surface.
 *
 * Guarantees (lexical):
 * 1. Absolute inputs, Windows drive letters, and `../` escapes all resolve
 *    outside `rootDir` and are rejected.
 * 2. Rejection is by exception, never by silent coercion to a safe path, so a
 *    caller cannot mistake a rewritten path for the one that was requested.
 *
 * Known limitation: this is a lexical (pre-syscall) check. A symlink inside
 * `rootDir` that points outside it is not detected. Callers that require
 * symlink-proof containment should `fs.realpath` the result and re-check.
 */

import * as path from "node:path";

/** Thrown when a requested path escapes its allowed root. Carries a 400 status. */
export class PathContainmentError extends Error {
  public readonly statusCode = 400;
  public readonly code = "PATH_OUTSIDE_ALLOWED_ROOT";

  constructor(requestedPath: string, rootDir: string) {
    super(`Path is not permitted: it resolves outside the allowed root directory (${rootDir}).`);
    this.name = "PathContainmentError";
    // Keep the offending value out of the client-facing message.
    this.requestedPath = requestedPath;
  }

  public readonly requestedPath: string;
}

/**
 * Resolves `requestedPath` against `rootDir` and guarantees containment.
 *
 * @throws {PathContainmentError} when the input is not a usable string or
 *         resolves to `rootDir` itself or anything outside it.
 */
export function resolveContainedPath(rootDir: string, requestedPath: unknown): string {
  if (typeof requestedPath !== "string" || requestedPath.trim() === "") {
    throw new PathContainmentError(String(requestedPath), rootDir);
  }

  const root = path.resolve(rootDir);
  const resolved = path.resolve(root, requestedPath);
  const relative = path.relative(root, resolved);

  // relative === ''  -> the root itself, which is a directory, not a file target.
  // relative.startsWith('..') or isAbsolute(relative) -> escaped the root.
  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PathContainmentError(requestedPath, root);
  }

  return resolved;
}
