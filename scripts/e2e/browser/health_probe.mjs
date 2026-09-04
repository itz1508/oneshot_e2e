/** Health endpoint probe: positive (Bearer) + negative (no token) proof. */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");

function loadDotEnv(f) {
  const out = {};
  try {
    for (const line of readFileSync(f, "utf8").split(/\r?\n/)) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (m) out[m[1]] = m[2].trim();
    }
  } catch {}
  return out;
}
const token =
  process.env.ONESHOT_API_TOKEN || loadDotEnv(join(ROOT, ".env")).ONESHOT_API_TOKEN;
const BASE = "http://127.0.0.1:8787";

const result = { at: new Date().toISOString() };
const withToken = await fetch(`${BASE}/api/health`, {
  headers: { authorization: `Bearer ${token}` },
});
result.with_token = {
  status: withToken.status,
  body: await withToken.json(),
};
const withoutToken = await fetch(`${BASE}/api/health`);
result.without_token = {
  status: withoutToken.status,
  body: await withoutToken.text(),
};
const wrongToken = await fetch(`${BASE}/api/health`, {
  headers: { authorization: "Bearer definitely-wrong-token" },
});
result.wrong_token = { status: wrongToken.status, body: await wrongToken.text() };

writeFileSync(join(ROOT, "dist", "e2e-evidence", "health.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
