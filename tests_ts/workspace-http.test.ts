import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { startHttpServer } from "../backend/server/http-server.js";

function containsPath(nodes: any[], expected: string): boolean {
  for (const node of nodes) {
    if (node.path === expected) return true;
    if (node.children && containsPath(node.children, expected)) return true;
  }
  return false;
}

test("workspace API loads the whole repository tree on first launch and confines reads", async () => {
  const workspaceRoot = resolve(`data/test-workspace-http/${process.pid}`);
  const deepDirectory = resolve(workspaceRoot, "one/two/three/four/five");
  await rm(workspaceRoot, { recursive: true, force: true });
  await mkdir(deepDirectory, { recursive: true });
  await writeFile(resolve(deepDirectory, "proof.txt"), "whole-repo-readable", "utf8");

  const server = await startHttpServer(
    {} as any,
    {} as any,
    {} as any,
    resolve("ui"),
    0,
    undefined,
    undefined,
    undefined,
    undefined,
    { workspaceRoot },
  );

  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;

    const treeResponse = await fetch(`${base}/v1/workspace/tree?path=.`);
    assert.equal(treeResponse.status, 200);
    const tree = (await treeResponse.json()) as any;
    assert.equal(tree.depth, null);
    assert.equal(
      containsPath(tree.nodes, "one/two/three/four/five/proof.txt"),
      true,
    );

    const fileResponse = await fetch(
      `${base}/v1/workspace/file?path=${encodeURIComponent("one/two/three/four/five/proof.txt")}`,
    );
    assert.equal(fileResponse.status, 200);
    assert.equal((await fileResponse.json() as any).content, "whole-repo-readable");

    const escaped = await fetch(
      `${base}/v1/workspace/file?path=${encodeURIComponent("../package.json")}`,
    );
    assert.equal(escaped.status, 400);
  } finally {
    server.closeAllConnections?.();
    await new Promise<void>((ok, fail) =>
      server.close((error) => (error ? fail(error) : ok())),
    );
    await rm(workspaceRoot, { recursive: true, force: true });
    // Settle lingering libuv handles (undici client keep-alive socket close)
    // before the test runner tears down; `--test-force-exit` races handle
    // closure on Windows otherwise (libuv `UV_HANDLE_CLOSING` assertion).
    await new Promise((r) => setTimeout(r, 250));
  }
});
