import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mode = process.argv[2];

const required = [
    "app/layout.tsx",
    "app/page.tsx",
    "app/globals.css",
    "src/api/client.ts",
    "src/api/providers.ts",
    "src/components/workspace.tsx",
];
for (const f of required) {
    if (!fs.existsSync(path.join(root, f))) throw Error(`missing ${f}`);
}
const sources = [...required.map((f) => fs.readFileSync(path.join(root, f), "utf8"))];
const js = sources.join("\n");
if (mode === "typecheck") {
    // Real typecheck runs via `npm run typecheck` (tsc --noEmit).
    // This legacy check only guards the old vanilla-js console and must not
    // claim a passing typecheck for the Next.js app.
    throw Error("check.mjs typecheck mode is retired; run `npm run typecheck` instead");
} else {
    if (/console\.(log|debug)|eval\(|innerHTML\s*\+=/.test(js))
        throw Error("lint rule violation");
    console.log("LINT PASSED");
}
