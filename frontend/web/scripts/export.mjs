import { existsSync, mkdirSync } from "node:fs";

if (!existsSync("dist")) {
  mkdirSync("dist", { recursive: true });
}
console.log("Export finalized to dist/");
