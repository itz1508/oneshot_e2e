import { existsSync } from "node:fs";
import { resolveRuntimePaths } from "./runtime-paths.js";

const environmentFile = resolveRuntimePaths().trace.environmentFile;
if (existsSync(environmentFile)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      "ROOT_CAUSE: loading .env requires Node.js 20.12+; set variables in the process environment instead",
    );
  }
  process.loadEnvFile(environmentFile);
}
