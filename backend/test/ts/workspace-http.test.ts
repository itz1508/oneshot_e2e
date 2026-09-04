import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import type { Server } from "node:http";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { startHttpServer } from "../../server/http-server.js";

const AUTHORIZATION = { Authorization: "Bearer workspace-security-test" };

function containsPath(nodes: any[], expected: string): boolean {
  for (const node of nodes) {
    if (node.path === expected) return true;
    if (node.children && containsPath(node.children, expected)) return true;
  }
  return false;
}

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

test("workspace filesystem security boundary is enforced consistently", async () => {
  const savedEnvironment = {
    bind: process.env.ONESHOT_BIND_HOST,
    token: process.env.ONESHOT_API_TOKEN,
    rateMax: process.env.API_RATE_LIMIT_MAX,
    rateWindow: process.env.API_RATE_LIMIT_WINDOW_MS,
  };
  const temporaryRoot = await mkdtemp(join(tmpdir(), "oneshot-workspace-security-"));
  const workspaceRoot = join(temporaryRoot, "workspace");
  const externalRoot = join(temporaryRoot, "outside");
  const deepDirectory = join(workspaceRoot, "one", "two", "three", "four", "five");
  const openServers: Server[] = [];

  try {
    const environmentProbeRoot = join(temporaryRoot, "environment-probe");
    await mkdir(join(environmentProbeRoot, "app", "env"), { recursive: true });
    await writeFile(
      join(environmentProbeRoot, "app", "env", ".env"),
      "ONESHOT_ENVIRONMENT_PROBE=loaded-from-file\n",
      "utf8",
    );
    const probeEnvironment = { ...process.env };
    delete probeEnvironment.ONESHOT_ENVIRONMENT_PROBE;
    const environmentModule = pathToFileURL(
      resolve("dist/backend/environment.js"),
    ).href;
    const environmentProbe = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "--eval",
        `process.chdir(${JSON.stringify(environmentProbeRoot)}); await import(${JSON.stringify(environmentModule)}); process.stdout.write(process.env.ONESHOT_ENVIRONMENT_PROBE || "")`,
      ],
      { encoding: "utf8", env: probeEnvironment },
    );
    assert.equal(environmentProbe.status, 0, environmentProbe.stderr);
    assert.equal(environmentProbe.stdout, "loaded-from-file");

    await mkdir(deepDirectory, { recursive: true });
    await mkdir(externalRoot, { recursive: true });
    await mkdir(join(workspaceRoot, "safe-write"), { recursive: true });
    await mkdir(join(workspaceRoot, "data"), { recursive: true });
    await mkdir(join(workspaceRoot, "nested"), { recursive: true });
    await mkdir(join(workspaceRoot, "secrets-store"), { recursive: true });
    await writeFile(join(deepDirectory, "proof.txt"), "whole-repo-readable", "utf8");
    await writeFile(join(workspaceRoot, ".env"), "TOKEN=secret", "utf8");
    await writeFile(join(workspaceRoot, ".env.local"), "TOKEN=secret", "utf8");
    await mkdir(join(workspaceRoot, "app", "env"), { recursive: true });
    await writeFile(join(workspaceRoot, "app", "env", ".env.example"), "PUBLIC=yes", "utf8");
    await writeFile(join(workspaceRoot, "app", "env", ".env.workspace.example"), "PUBLIC=yes", "utf8");
    await writeFile(join(workspaceRoot, "app", "env", ".env"), "TOKEN=secret", "utf8");
    await writeFile(join(workspaceRoot, "nested", ".env.example"), "PRIVATE=yes", "utf8");
    await writeFile(join(workspaceRoot, "private.key"), "private", "utf8");
    await writeFile(join(workspaceRoot, "credentials.json"), "{}", "utf8");
    await writeFile(join(workspaceRoot, "secrets-note.txt"), "private", "utf8");
    await writeFile(join(workspaceRoot, "data", "runtime.txt"), "private", "utf8");
    await writeFile(join(workspaceRoot, "secrets-store", "value.txt"), "private", "utf8");
    await writeFile(join(externalRoot, "outside.txt"), "outside", "utf8");
    await symlink(externalRoot, join(workspaceRoot, "outside-link"), process.platform === "win32" ? "junction" : "dir");
    await symlink(join(workspaceRoot, "secrets-store"), join(workspaceRoot, "safe-link"), process.platform === "win32" ? "junction" : "dir");

    delete process.env.ONESHOT_BIND_HOST;
    delete process.env.ONESHOT_API_TOKEN;
    process.env.API_RATE_LIMIT_MAX = "100";
    process.env.API_RATE_LIMIT_WINDOW_MS = "60000";

    const defaultServer = await launch(workspaceRoot);
    openServers.push(defaultServer);
    const defaultAddress = defaultServer.address();
    assert.ok(defaultAddress && typeof defaultAddress === "object");
    assert.equal(defaultAddress.address, "127.0.0.1");
    assert.equal((await fetch(`${baseUrl(defaultServer)}/api/health`)).status, 200);
    await closeServer(defaultServer);
    openServers.splice(openServers.indexOf(defaultServer), 1);

    process.env.ONESHOT_BIND_HOST = "0.0.0.0";
    await assert.rejects(launch(workspaceRoot), /ROOT_CAUSE:.*requires ONESHOT_API_TOKEN/);

    process.env.ONESHOT_API_TOKEN = "workspace-security-test";
    const externalServer = await launch(workspaceRoot);
    openServers.push(externalServer);
    const externalAddress = externalServer.address();
    assert.ok(externalAddress && typeof externalAddress === "object");
    assert.equal(externalAddress.address, "0.0.0.0");
    assert.equal((await fetch(`${baseUrl(externalServer)}/api/health`)).status, 401);
    assert.equal((await fetch(`${baseUrl(externalServer)}/api/health`, { headers: AUTHORIZATION })).status, 200);
    await closeServer(externalServer);
    openServers.splice(openServers.indexOf(externalServer), 1);

    process.env.ONESHOT_BIND_HOST = "127.0.0.1";
    const secureServer = await launch(workspaceRoot);
    openServers.push(secureServer);
    const secureBase = baseUrl(secureServer);

    assert.equal((await fetch(`${secureBase}/api`)).status, 401);
    assert.equal((await fetch(`${secureBase}/v1`)).status, 401);
    assert.equal((await fetch(`${secureBase}/api/status`)).status, 401);
    assert.equal((await fetch(`${secureBase}/api/workspace/tree?path=.`)).status, 401);
    assert.equal((await fetch(`${secureBase}/v1/workspace/tree?path=.`)).status, 401);
    assert.equal((await fetch(`${secureBase}/v1/workspace/file?path=one/two/three/four/five/proof.txt`)).status, 401);
    assert.equal((await fetch(`${secureBase}/v1/workspace/file`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: "safe-write/unauthorized.txt", content: "no" }),
    })).status, 401);

    const treeResponse = await fetch(`${secureBase}/v1/workspace/tree?path=.`, { headers: AUTHORIZATION });
    assert.equal(treeResponse.status, 200);
    const tree = (await treeResponse.json()) as any;
    assert.equal(tree.depth, null);
    assert.equal(containsPath(tree.nodes, "one/two/three/four/five/proof.txt"), true);
    assert.equal(containsPath(tree.nodes, "app/env/.env.example"), true);
    assert.equal(containsPath(tree.nodes, "app/env/.env.workspace.example"), true);
    for (const denied of [
      ".env", ".env.local", "private.key", "credentials.json", "secrets-note.txt",
      "data", "nested/.env.example", "outside-link", "safe-link", "app/env/.env",
    ]) {
      assert.equal(containsPath(tree.nodes, denied), false, `${denied} must be omitted`);
    }

    const safeRead = await fetch(
      `${secureBase}/v1/workspace/file?path=${encodeURIComponent("one/two/three/four/five/proof.txt")}`,
      { headers: AUTHORIZATION },
    );
    assert.equal(safeRead.status, 200);
    assert.equal(((await safeRead.json()) as any).content, "whole-repo-readable");

    const safeWrite = await fetch(`${secureBase}/v1/workspace/file`, {
      method: "POST",
      headers: { ...AUTHORIZATION, "content-type": "application/json" },
      body: JSON.stringify({ path: "safe-write/proof.txt", content: "safe-write-passed" }),
    });
    assert.equal(safeWrite.status, 200);
    assert.equal(await readFile(join(workspaceRoot, "safe-write", "proof.txt"), "utf8"), "safe-write-passed");

    for (const deniedPath of [
      ".env", ".env.local", "private.key", "credentials.json", "secrets-note.txt",
      "nested/.env.example", "data/runtime.txt", "outside-link/outside.txt", "safe-link/value.txt",
    ]) {
      const response = await fetch(
        `${secureBase}/v1/workspace/file?path=${encodeURIComponent(deniedPath)}`,
        { headers: AUTHORIZATION },
      );
      assert.equal(response.status, 403, `${deniedPath} must be denied`);
    }

    for (const deniedPath of [
      ".env",
      "new-private.pem",
      "credentials-new.json",
      "outside-link/new.txt",
      "safe-link/new.txt",
    ]) {
      const response = await fetch(`${secureBase}/v1/workspace/file`, {
        method: "POST",
        headers: { ...AUTHORIZATION, "content-type": "application/json" },
        body: JSON.stringify({ path: deniedPath, content: "denied" }),
      });
      assert.equal(response.status, 403, `${deniedPath} write must be denied`);
    }

    const traversal = await fetch(
      `${secureBase}/v1/workspace/file?path=${encodeURIComponent("../package.json")}`,
      { headers: AUTHORIZATION },
    );
    assert.equal(traversal.status, 400);
    const traversalWrite = await fetch(`${secureBase}/v1/workspace/file`, {
      method: "POST",
      headers: { ...AUTHORIZATION, "content-type": "application/json" },
      body: JSON.stringify({ path: "../outside.txt", content: "denied" }),
    });
    assert.equal(traversalWrite.status, 400);
    await closeServer(secureServer);
    openServers.splice(openServers.indexOf(secureServer), 1);

    process.env.API_RATE_LIMIT_MAX = "1";
    const apiRateServer = await launch(workspaceRoot);
    openServers.push(apiRateServer);
    const apiRateBase = baseUrl(apiRateServer);
    assert.equal((await fetch(`${apiRateBase}/api/status`, { headers: AUTHORIZATION })).status, 200);
    assert.equal((await fetch(`${apiRateBase}/api/status`, { headers: AUTHORIZATION })).status, 429);
    await closeServer(apiRateServer);
    openServers.splice(openServers.indexOf(apiRateServer), 1);

    const v1RateServer = await launch(workspaceRoot);
    openServers.push(v1RateServer);
    const v1RateBase = baseUrl(v1RateServer);
    assert.equal((await fetch(`${v1RateBase}/v1/status`, { headers: AUTHORIZATION })).status, 200);
    assert.equal((await fetch(`${v1RateBase}/v1/status`, { headers: AUTHORIZATION })).status, 429);
  } finally {
    for (const server of openServers) await closeServer(server);
    const restore = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };
    restore("ONESHOT_BIND_HOST", savedEnvironment.bind);
    restore("ONESHOT_API_TOKEN", savedEnvironment.token);
    restore("API_RATE_LIMIT_MAX", savedEnvironment.rateMax);
    restore("API_RATE_LIMIT_WINDOW_MS", savedEnvironment.rateWindow);
    await rm(temporaryRoot, { recursive: true, force: true });
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
  }
});
