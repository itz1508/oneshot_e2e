import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HardenedProcessRunner } from "../../sandbox/runner/process-runner.js";

test("HardenedProcessRunner scanWorkspace classifies created, modified, and deleted files with real hashes", () => {
  const root = mkdtempSync(join(tmpdir(), "oneshot-runner-test-"));
  try {
    const workDir = join(root, "work");
    const outDir = join(root, "output");
    mkdirSync(workDir, { recursive: true });
    mkdirSync(outDir, { recursive: true });

    // Pre-existing baseline file (will be modified)
    writeFileSync(join(workDir, "baseline.txt"), "baseline");
    // Pre-existing file that will be deleted
    writeFileSync(join(outDir, "removed.txt"), "remove me");

    const runner = new HardenedProcessRunner();
    const baseline = new Map<string, { size: number; sha256: string }>();
    for (const [dir, label] of [[workDir, "/work"], [outDir, "/output"]] as const) {
      for (const [path, meta] of (runner as any).snapshotDir(dir, label)) {
        baseline.set(path, meta);
      }
    }

    // Simulate post-execution state
    writeFileSync(join(workDir, "baseline.txt"), "baseline modified");
    writeFileSync(join(workDir, "new.txt"), "brand new file");
    unlinkSync(join(outDir, "removed.txt"));

    const { changes, bytesWritten } = (runner as any).scanWorkspace(workDir, outDir, baseline);

    const byPath = new Map<string, any>(changes.map((c: any) => [c.path, c]));
    assert.equal(byPath.get("/work/new.txt")?.action, "created");
    assert.equal(byPath.get("/work/new.txt")?.bytes, 14);
    assert.ok(byPath.get("/work/new.txt")?.sha256);

    assert.equal(byPath.get("/work/baseline.txt")?.action, "modified");
    assert.equal(byPath.get("/work/baseline.txt")?.bytes, 17);
    assert.ok(byPath.get("/work/baseline.txt")?.sha256);
    assert.ok(byPath.get("/work/baseline.txt")?.previous_sha256);
    assert.equal(byPath.get("/work/baseline.txt")?.previous_bytes, 8);

    assert.equal(byPath.get("/output/removed.txt")?.action, "deleted");
    assert.equal(byPath.get("/output/removed.txt")?.bytes, 0);
    assert.ok(byPath.get("/output/removed.txt")?.previous_sha256);

    assert.ok(bytesWritten > 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
