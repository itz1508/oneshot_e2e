import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

if (!existsSync("dist")) {
  mkdirSync("dist", { recursive: true });
}

// GitHub Pages serves a static artifact through Jekyll unless this marker is
// present. Jekyll ignores every path beginning with an underscore, so the whole
// _next/ bundle -- the JavaScript and CSS the app needs to boot -- was silently
// dropped and the deployed site shipped as an unstyled HTML shell. Writing the
// marker makes Pages publish the tree verbatim.
//
// This is the last step of `next build --webpack`, so it runs on every build
// and can never be forgotten by a caller.
const nojekyll = path.join("dist", ".nojekyll");
if (!existsSync(nojekyll)) {
  writeFileSync(nojekyll, "", "utf8");
}

console.log("Export finalized to dist/ (with .nojekyll so Pages serves _next/ verbatim)");
