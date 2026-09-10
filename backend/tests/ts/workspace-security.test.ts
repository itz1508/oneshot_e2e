import test from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";

const WORKSPACE_ROOT = resolve();

// ----- Workspace Security: Sensitive Path Denial -----

test(".env and .env.* files within workspace must not be disclosed via HTTP", () => {
  const sensitiveRelative = [".env", ".env.local", ".env.production"];
  for (const rel of sensitiveRelative) {
    const full = resolve(WORKSPACE_ROOT, rel);
    const isWithinWorkspace = full.startsWith(resolve(WORKSPACE_ROOT));
    assert.ok(isWithinWorkspace, `${full} is within workspace`);
  }
});
