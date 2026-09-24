import { execSync } from "node:child_process";

console.log("Running frontend static checks...");
try {
  execSync("pnpm exec tsc --noEmit", { stdio: "inherit", shell: true });
  console.log("Frontend checks passed cleanly.");
} catch (err) {
  process.exit(1);
}
