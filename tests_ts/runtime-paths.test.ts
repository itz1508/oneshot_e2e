import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { resolveRuntimePaths } from "../backend/runtime-paths.js";
import { SkillCatalog } from "../backend/skill/catalog.js";

test("runtime paths and built-in skills remain rooted when process CWD changes", async () => {
  const projectRoot = resolve(".");
  const foreignCwd = await mkdtemp(join(tmpdir(), "oneshot-runtime-paths-"));
  const originalCwd = process.cwd();

  try {
    process.chdir(foreignCwd);
    const runtimePaths = resolveRuntimePaths({
      projectRoot,
      workspaceRoot: ".",
      env: {},
    });
    const catalog = new SkillCatalog(undefined, runtimePaths);

    assert.equal(runtimePaths.projectRoot, projectRoot);
    assert.equal(runtimePaths.workspaceRoot, projectRoot);
    assert.equal(runtimePaths.trace.projectRootSource, "explicit");
    assert.equal(runtimePaths.trace.workspaceRootSource, "explicit");
    assert.ok(isAbsolute(runtimePaths.dataRoot));
    for (const descriptor of catalog.list()) {
      assert.ok(
        descriptor.path.startsWith(runtimePaths.skillRoot),
        `${descriptor.skill_id} escaped the canonical skill root: ${descriptor.path}`,
      );
      assert.equal(existsSync(descriptor.path), true, descriptor.path);
    }
  } finally {
    process.chdir(originalCwd);
    await rm(foreignCwd, { recursive: true, force: true });
  }
});

test("relative environment roots resolve from the detected project root", () => {
  const projectRoot = resolve(".");
  const runtimePaths = resolveRuntimePaths({
    startDirectory: join(projectRoot, "backend"),
    env: {
      ONESHOT_ROOT: ".",
      ONESHOT_WORKSPACE_ROOT: "fixtures",
    },
  });

  assert.equal(runtimePaths.projectRoot, projectRoot);
  assert.equal(runtimePaths.workspaceRoot, join(projectRoot, "fixtures"));
  assert.equal(runtimePaths.trace.projectRootSource, "environment");
  assert.equal(runtimePaths.trace.workspaceRootSource, "environment");
  assert.equal(runtimePaths.trace.environmentFile, join(projectRoot, ".env"));
});
