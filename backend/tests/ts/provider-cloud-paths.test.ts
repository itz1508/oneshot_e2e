import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

function tsFiles(root: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(root)) {
    if (name === "tests") continue;
    const path = join(root, name);
    if (statSync(path).isDirectory()) out.push(...tsFiles(path));
    else if (path.endsWith(".ts")) out.push(path);
  }
  return out;
}

test("backend runtime does not import provider authority from app/web", () => {
  for (const path of tsFiles("backend")) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /app\/web\/cloud\/provider/, path);
    assert.doesNotMatch(source, /ResearchProvider/, path);
  }
});
