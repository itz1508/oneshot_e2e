import { execSync } from "node:child_process";

console.log("Running frontend static checks...");
try {
  execSync("npx tsc --noEmit", { stdio: "inherit" });
  console.log("Frontend checks passed cleanly.");
} catch (err) {
  process.exit(1);
}
