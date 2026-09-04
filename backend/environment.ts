import { existsSync } from "node:fs";
import { resolve } from "node:path";

const environmentFile = resolve(process.cwd(), "app", "env", ".env");
if (existsSync(environmentFile)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      "ROOT_CAUSE: loading .env requires Node.js 20.12+; set variables in the process environment instead",
    );
  }
  process.loadEnvFile(environmentFile);
}
