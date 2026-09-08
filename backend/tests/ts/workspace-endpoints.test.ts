import test from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startHttpServer } from "../../server/http-server.js";

const AUTHORIZATION = { Authorization: "Bearer workspace-endpoint-test" };

async function closeServer(server: Server): Promise<void> {
  server.closeAllConnections?.();
  await new Promise<void>((ok, fail) =>
    server.close((error) => (error ? fail(error) : ok())),
  );
}

async function launch(workspaceRoot: string): Promise<Server> {
  return startHttpServer(
    {} as any,
    {} as any,
    {} as any,
    resolve("app/web/dist"),
    0,
    undefined,
    undefined,
    undefined,
    undefined,
    { workspaceRoot },
  );
}

function baseUrl(server: Server): string {
  const address = server.address();
  assert.ok(address && typeof address === "object");
  return `http://127.0.0.1:${address.port}`;
}

test("workspace tree and info endpoints return real structure", async () => {
  const savedToken = process.env.ONESHOT_API_TOKEN;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oneshot-workspace-endpoints-"));
  const workspaceRoot = join(temporaryRoot, "workspace");
  let server: Server | undefined;

  try {
    await mkdir(workspaceRoot, { recursive: true });
    await mkdir(join(workspaceRoot, "src"), { recursive: true });
    await writeFile(join(workspaceRoot, "README.md"), "# Test Project\n", "utf8");
    await writeFile(join(workspaceRoot, "src", "index.ts"), "export const x = 1;\n", "utf8");
    await writeFile(join(workspaceRoot, "package.json"), '{"name":"test"}\n', "utf8");

    process.env.ONESHOT_API_TOKEN = "workspace-endpoint-test";
    server = await launch(workspaceRoot);
    const base = baseUrl(server);

    const treeRes = await fetch(`${base}/api/workspace/tree`, { headers: AUTHORIZATION });
    assert.equal(treeRes.status, 200, "tree endpoint should return 200");
    const tree = (await treeRes.json()) as { root: string; path: string; depth: number | null; nodes: any[] };
    assert.equal(tree.root, ".", "root should be '.' (relative workspace root)");
    assert.ok(tree.nodes && tree.nodes.length >= 3, "should have at least 3 entries");
    const readme = tree.nodes?.find((c: any) => c.name === "README.md");
    assert.ok(readme, "README.md should be in tree");
    assert.equal(readme.type, "file", "README should be a file");
    assert.equal(readme.size, Buffer.byteLength("# Test Project\n", "utf8"), "README size should match");
    const srcDir = tree.nodes?.find((c: any) => c.name === "src");
    assert.ok(srcDir, "src directory should be in tree");
    assert.equal(srcDir.type, "folder", "src should be a folder");
    assert.ok(srcDir.children?.length === 1, "src should have 1 child (index.ts)");
    assert.equal(srcDir.children[0].name, "index.ts", "src child should be index.ts");

    const infoRes = await fetch(`${base}/api/workspace/info`, { headers: AUTHORIZATION });
    assert.equal(infoRes.status, 200, "info endpoint should return 200");
    const info = (await infoRes.json()) as {
      root: string;
      source: string;
      explicit: boolean;
      file_count: number;
      total_bytes: number;
      digest: string;
      created_at: string;
    };
    assert.equal(info.root, workspaceRoot, "info root should match workspace root");
    assert.equal(info.source, "project-root-fallback", "source should be project-root-fallback");
    assert.equal(info.explicit, true, "explicit should be true");
    assert.equal(info.file_count, 3, "file_count should be 3");
    assert.ok(info.total_bytes > 0, "total_bytes should be positive");
    assert.ok(typeof info.digest === "string" && info.digest.length === 64, "digest should be sha256 hex");
    assert.ok(typeof info.created_at === "string" && !isNaN(Date.parse(info.created_at)), "created_at should be ISO string");

    const unauthRes = await fetch(`${base}/api/workspace/tree`);
    assert.equal(unauthRes.status, 401, "unauthenticated request should return 401");
    const unauthInfo = await fetch(`${base}/api/workspace/info`);
    assert.equal(unauthInfo.status, 401, "unauthenticated info request should return 401");

    await closeServer(server);
    server = undefined;
  } finally {
    if (server) await closeServer(server);
    process.env.ONESHOT_API_TOKEN = savedToken;
    await rm(temporaryRoot, { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 250));
  }
});

test("workspace tree respects deny list and traversal guards", async () => {
  const savedToken = process.env.ONESHOT_API_TOKEN;
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oneshot-workspace-deny-"));
  const workspaceRoot = join(temporaryRoot, "workspace");
  let server: Server | undefined;

  try {
    await mkdir(workspaceRoot, { recursive: true });
    await writeFile(join(workspaceRoot, ".env"), "SECRET=value\n", "utf8");
    await writeFile(join(workspaceRoot, "allowed.txt"), "visible\n", "utf8");

    process.env.ONESHOT_API_TOKEN = "workspace-endpoint-test";
    server = await launch(workspaceRoot);
    const base = baseUrl(server);

    const treeRes = await fetch(`${base}/v1/workspace/tree`, { headers: AUTHORIZATION });
    assert.equal(treeRes.status, 200);
    const tree = (await treeRes.json()) as { nodes: any[] };

    const envEntry = tree.nodes?.find((c: any) => c.name === ".env");
    assert.equal(envEntry, undefined, ".env should not appear in tree");
    const allowed = tree.nodes?.find((c: any) => c.name === "allowed.txt");
    assert.ok(allowed, "allowed.txt should appear in tree");

    await closeServer(server);
    server = undefined;
  } finally {
    if (server) await closeServer(server);
    process.env.ONESHOT_API_TOKEN = savedToken;
    await rm(temporaryRoot, { recursive: true, force: true });
    await new Promise((r) => setTimeout(r, 250));
  }
});
