/** Health endpoint probe. */
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, "..", "..", "..");
const BASE = "http://127.0.0.1:8787";

const result = { at: new Date().toISOString() };
const health = await fetch(`${BASE}/api/health`);
result.health = {
  status: health.status,
  body: await health.json(),
};

writeFileSync(join(ROOT, "dist", "e2e-evidence", "health.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
