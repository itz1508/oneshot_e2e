import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  GitLocalStorage,
  GitHubStorage,
  createStrandsAgent,
} from "../src/index.ts";

test("Versioned Git & GitHub Storage Suite", async (t) => {
  const tmpRoot = path.resolve("./.oneshot/test-storage-tmp");
  await fs.mkdir(tmpRoot, { recursive: true });

  t.after(async () => {
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  await t.test("GitLocalStorage provides full CRUD and byte-exact round-trip", async () => {
    const storage = new GitLocalStorage({ rootDir: tmpRoot });

    const key = "sessions/session-001.json";
    const testBytes = new TextEncoder().encode(
      JSON.stringify({ sessionId: "session-001", stage: "research" })
    );

    // 1. Write
    await storage.write(key, testBytes);

    // 2. Read
    const retrieved = await storage.read(key);
    assert.ok(retrieved !== null, "Stored value should not be null");
    assert.deepEqual(retrieved, testBytes);

    // 3. List
    const allKeys = await storage.list();
    assert.ok(allKeys.includes("sessions/session-001.json"));

    const sessionKeys = await storage.list("sessions");
    assert.ok(sessionKeys.includes("sessions/session-001.json"));

    // 4. Delete
    await storage.delete(key);
    const afterDelete = await storage.read(key);
    assert.equal(afterDelete, null);
  });

  await t.test("GitLocalStorage namespaces isolate data keys", async () => {
    const rootStorage = new GitLocalStorage({ rootDir: tmpRoot });
    const checkpoints = rootStorage.namespace("checkpoints");
    const audit = rootStorage.namespace("audit");

    const checkpointData = new TextEncoder().encode(JSON.stringify({ hash: "pkg-123" }));
    const auditData = new TextEncoder().encode(JSON.stringify({ event: "GATE_CONFIRMED" }));

    await checkpoints.write("RES-7702-INIT", checkpointData);
    await audit.write("log-1", auditData);

    // Scoped reads
    const cpRead = await checkpoints.read("RES-7702-INIT");
    assert.deepEqual(cpRead, checkpointData);

    const auditRead = await audit.read("log-1");
    assert.deepEqual(auditRead, auditData);

    // List in namespace returns relative keys
    const cpList = await checkpoints.list();
    assert.ok(cpList.includes("RES-7702-INIT"));
    assert.ok(!cpList.includes("log-1"));

    // Root list includes full paths
    const rootList = await rootStorage.list();
    assert.ok(rootList.includes("checkpoints/RES-7702-INIT"));
    assert.ok(rootList.includes("audit/log-1"));
  });

  await t.test("GitLocalStorage creates snapshots and computes diffs", async () => {
    const storage = new GitLocalStorage({ rootDir: tmpRoot });
    const ns = storage.namespace("run-01");

    await ns.write("doc1.txt", new TextEncoder().encode("Hello v1"));
    const snap1 = await storage.createSnapshot({
      stage: "research",
      restorePoint: "RES-7702-INIT",
      message: "Research completed",
    });

    assert.ok(snap1.id.startsWith("snap_"));
    assert.equal(snap1.stage, "research");

    // Modify file and add new file
    await ns.write("doc1.txt", new TextEncoder().encode("Hello v2 with additional insights"));
    await ns.write("doc2.txt", new TextEncoder().encode("Second file"));

    const snap2 = await storage.createSnapshot({
      stage: "planning",
      message: "Plan generated",
    });

    const diffs = await storage.compareSnapshots(snap1.id, snap2.id);
    assert.ok(diffs.length >= 2);

    const doc1Diff = diffs.find((d) => d.key === "run-01/doc1.txt");
    const doc2Diff = diffs.find((d) => d.key === "run-01/doc2.txt");

    assert.ok(doc1Diff);
    assert.equal(doc1Diff.status, "modified");

    assert.ok(doc2Diff);
    assert.equal(doc2Diff.status, "added");
  });

  await t.test("GitHubStorage operates in offline fallback when GITHUB_TOKEN is unset", async () => {
    const ghStorage = new GitHubStorage(
      {
        owner: "test-owner",
        repo: "test-repo",
      },
      { localFallbackDir: tmpRoot }
    );

    assert.equal(ghStorage.isConfiguredRemote, false);

    const key = "gh-offline/test.dat";
    const data = new TextEncoder().encode("Offline test content");

    await ghStorage.write(key, data);
    const readBack = await ghStorage.read(key);
    assert.deepEqual(readBack, data);

    const list = await ghStorage.list("gh-offline");
    assert.ok(list.some((k) => k.includes("test.dat")));

    await ghStorage.delete(key);
    assert.equal(await ghStorage.read(key), null);
  });

  await t.test("createStrandsAgent accepts custom storage backend", async () => {
    const storage = new GitLocalStorage({ rootDir: tmpRoot });
    const agent = createStrandsAgent({
      storage,
    });

    assert.ok(agent);
    // Verify storage reference exists on the initialized agent
    assert.equal(agent.storage, storage);
  });
});
