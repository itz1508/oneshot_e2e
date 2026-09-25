import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { GitHubStorage, GitLocalStorage } from "../src/index.ts";

/**
 * Strict remote-response contract suite for GitHubStorage.
 *
 * Enforces: a transport that resolves is not evidence of success. Every remote
 * response must satisfy its payload contract, or the call must fail loudly
 * (contract errors) or use the documented local fallback (transport errors).
 */

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function stubFetch(handler) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function createStorage(localFallbackDir) {
  return new GitHubStorage(
    {
      owner: "oneshot-owner",
      repo: "oneshot-repo",
      token: "gh_contract_test_token",
      branch: "trunk",
      pathPrefix: ".oneshot/storage",
    },
    { localFallbackDir }
  );
}

function encode(text) {
  return new TextEncoder().encode(text);
}

test("GitHubStorage strict remote response contracts", async (t) => {
  const tmpRoot = path.resolve("./.oneshot/test-github-contract-tmp");
  await fs.mkdir(tmpRoot, { recursive: true });

  t.after(async () => {
    try {
      await fs.rm(tmpRoot, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  await t.test("write rejects a lookup response that omits the file sha", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () => jsonResponse({ name: "file.txt" }));
    try {
      await assert.rejects(
        () => storage.write("contract/lookup.txt", encode("payload")),
        /GitHub content lookup response is missing sha/
      );
    } finally {
      restore();
    }
  });

  await t.test("write rejects a PUT response that does not confirm content and commit SHAs", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async (url, init = {}) => {
      if (init.method === "PUT") return jsonResponse({ content: {}, commit: {} });
      return jsonResponse({ message: "Not Found" }, 404);
    });
    try {
      await assert.rejects(
        () => storage.write("contract/no-sha.txt", encode("payload")),
        /GitHub content write response did not confirm the content and commit SHAs/
      );
    } finally {
      restore();
    }
  });

  await t.test("write rejects a PUT response that confirms a different path", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async (url, init = {}) => {
      if (init.method === "PUT") {
        return jsonResponse({
          content: { sha: "content-sha-1", path: ".oneshot/storage/other/path.txt" },
          commit: { sha: "commit-sha-1" },
        });
      }
      return jsonResponse({ message: "Not Found" }, 404);
    });
    try {
      await assert.rejects(
        () => storage.write("contract/wrong-path.txt", encode("payload")),
        /did not confirm the content and commit SHAs/
      );
    } finally {
      restore();
    }
  });

  await t.test("write succeeds on a fully confirmed PUT and sends sha, base64 content and branch", async () => {
    const storage = createStorage(tmpRoot);
    const payload = encode("remote-canonical-bytes");
    const calls = [];
    const restore = stubFetch(async (url, init = {}) => {
      calls.push({ url, method: init.method || "GET", body: init.body ? JSON.parse(init.body) : null });
      if (init.method === "PUT") {
        return jsonResponse({
          content: { sha: "content-sha-ok", path: ".oneshot/storage/contract/round-trip.txt" },
          commit: { sha: "commit-sha-ok" },
        });
      }
      return jsonResponse({ sha: "existing-blob-sha" });
    });

    try {
      await storage.write("contract/round-trip.txt", payload);
      assert.strictEqual(calls.length, 2, "Expected exactly one lookup and one PUT");
      assert.strictEqual(calls[0].method, "GET");
      assert.strictEqual(calls[1].method, "PUT");
      assert.strictEqual(calls[1].body.sha, "existing-blob-sha");
      assert.strictEqual(calls[1].body.branch, "trunk");
      assert.strictEqual(calls[1].body.content, Buffer.from(payload).toString("base64"));
      assert.ok(calls[1].url.endsWith("/contents/.oneshot/storage/contract/round-trip.txt"));
    } finally {
      restore();
    }

    // No local fallback copy may exist after a confirmed remote write.
    const offline = stubFetch(async () => {
      throw new Error("network down");
    });
    try {
      assert.strictEqual(await storage.read("contract/round-trip.txt"), null);
    } finally {
      offline();
    }
  });

  await t.test("read rejects a 2xx payload that fails its path/sha/base64 contract", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () =>
      jsonResponse({ path: ".oneshot/storage/somewhere-else.txt", sha: "s", encoding: "base64", content: "aGk=" })
    );
    try {
      await assert.rejects(
        () => storage.read("contract/read.txt"),
        /GitHub content read response failed its path\/sha\/base64 contract/
      );
    } finally {
      restore();
    }
  });

  await t.test("read rejects a 2xx payload with invalid base64 content", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () =>
      jsonResponse({
        path: ".oneshot/storage/contract/read.txt",
        sha: "blob-sha",
        encoding: "base64",
        content: "!!!not-valid-base64!!!",
      })
    );
    try {
      await assert.rejects(
        () => storage.read("contract/read.txt"),
        /GitHub content read response contains invalid base64/
      );
    } finally {
      restore();
    }
  });

  await t.test("read rejects a non-JSON 2xx response", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () =>
      new Response("<html>proxy</html>", { status: 200, headers: { "content-type": "text/html" } })
    );
    try {
      await assert.rejects(() => storage.read("contract/read.txt"), /non-JSON content/);
    } finally {
      restore();
    }
  });

  await t.test("read decodes real base64 content for a contract-conforming response", async () => {
    const storage = createStorage(tmpRoot);
    const expected = "canonical-remote-content";
    const restore = stubFetch(async () =>
      jsonResponse({
        path: ".oneshot/storage/contract/decode.txt",
        sha: "blob-sha",
        encoding: "base64",
        content: Buffer.from(expected, "utf-8").toString("base64"),
      })
    );
    try {
      const bytes = await storage.read("contract/decode.txt");
      assert.ok(bytes instanceof Uint8Array);
      assert.strictEqual(Buffer.from(bytes).toString("utf-8"), expected);
    } finally {
      restore();
    }
  });

  await t.test("read falls back to local storage when the remote returns 404", async () => {
    const storage = createStorage(tmpRoot);
    const local = new GitLocalStorage({ rootDir: tmpRoot, prefix: ".oneshot/storage" });
    await local.write("contract/local-only.txt", encode("local-fallback-bytes"));

    const restore = stubFetch(async () => jsonResponse({ message: "Not Found" }, 404));
    try {
      const bytes = await storage.read("contract/local-only.txt");
      assert.ok(bytes instanceof Uint8Array);
      assert.strictEqual(Buffer.from(bytes).toString("utf-8"), "local-fallback-bytes");
    } finally {
      restore();
    }
  });

  await t.test("read and write keep working through the local fallback on transport failure", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () => {
      throw new Error("socket hang up");
    });
    try {
      await storage.write("contract/offline.txt", encode("offline-bytes"));
      const bytes = await storage.read("contract/offline.txt");
      assert.ok(bytes instanceof Uint8Array);
      assert.strictEqual(Buffer.from(bytes).toString("utf-8"), "offline-bytes");
    } finally {
      restore();
    }
  });

  await t.test("delete rejects a lookup response that omits path or sha", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () => jsonResponse({ sha: "blob-sha" }));
    try {
      await assert.rejects(
        () => storage.delete("contract/delete.txt"),
        /GitHub delete lookup response is missing path or sha/
      );
    } finally {
      restore();
    }
  });

  await t.test("delete rejects a DELETE response that omits the commit sha", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async (url, init = {}) => {
      if (init.method === "DELETE") return jsonResponse({ commit: {} });
      return jsonResponse({ path: ".oneshot/storage/contract/delete.txt", sha: "blob-sha" });
    });
    try {
      await assert.rejects(
        () => storage.delete("contract/delete.txt"),
        /GitHub content delete response is missing commit sha/
      );
    } finally {
      restore();
    }
  });

  await t.test("delete removes the local fallback copy when the remote returns 404", async () => {
    const storage = createStorage(tmpRoot);
    const local = new GitLocalStorage({ rootDir: tmpRoot, prefix: ".oneshot/storage" });
    await local.write("contract/delete-fallback.txt", encode("stale"));

    const restore = stubFetch(async () => jsonResponse({ message: "Not Found" }, 404));
    try {
      await storage.delete("contract/delete-fallback.txt");
      assert.strictEqual(await local.read("contract/delete-fallback.txt"), null);
    } finally {
      restore();
    }
  });

  await t.test("list refuses a truncated tree instead of returning partial results", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () =>
      jsonResponse({ tree: [{ path: ".oneshot/storage/a.txt", type: "blob" }], truncated: true })
    );
    try {
      await assert.rejects(
        () => storage.list(),
        /GitHub tree listing response is truncated; refusing an incomplete result/
      );
    } finally {
      restore();
    }
  });

  await t.test("list rejects tree entries that are not path/type records", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () => jsonResponse({ tree: [{ path: 5, type: null }] }));
    try {
      await assert.rejects(
        () => storage.list(),
        /GitHub tree listing response is missing valid tree entries/
      );
    } finally {
      restore();
    }
  });

  await t.test("list returns only blob keys under the prefix, with the path prefix stripped", async () => {
    const storage = createStorage(tmpRoot);
    const restore = stubFetch(async () =>
      jsonResponse({
        tree: [
          { path: ".oneshot/storage/contract/b.txt", type: "blob" },
          { path: ".oneshot/storage/contract/a.txt", type: "blob" },
          { path: ".oneshot/storage/contract", type: "tree" },
          { path: "unrelated/other.txt", type: "blob" },
        ],
      })
    );
    try {
      assert.deepEqual(await storage.list("contract"), ["contract/a.txt", "contract/b.txt"]);
    } finally {
      restore();
    }
  });
});
