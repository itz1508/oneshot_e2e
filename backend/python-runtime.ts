import { existsSync } from "node:fs";
import { delimiter, join, resolve } from "node:path";

export type ResolvePythonOptions = {
  platform?: NodeJS.Platform;
  exists?: (path: string) => boolean;
  env?: NodeJS.ProcessEnv;
};

function findOnPath(
  command: string,
  platform: NodeJS.Platform,
  exists: (path: string) => boolean,
  env: NodeJS.ProcessEnv,
): string | undefined {
  const searchPaths = (env.PATH ?? env.Path ?? "")
    .split(delimiter)
    .filter((part) => part.length > 0);
  const suffixes = platform === "win32" ? [".exe", ".cmd", ""] : [""];
  for (const dir of searchPaths) {
    for (const suffix of suffixes) {
      const candidate = join(dir, `${command}${suffix}`);
      if (exists(candidate)) return candidate;
    }
  }
  return undefined;
}

/**
 * Single shared Python interpreter resolver for backend runtime bridges.
 *
 * Resolution order:
 *  1. `ONESHOT_PYTHON` environment override (documented in `.env.example`).
 *  2. Project virtual environment:
 *     - Windows: `.venv/Scripts/python.exe`
 *     - POSIX:   `.venv/bin/python`
 *  3. PATH fallback: `python3`, then `python`.
 */
export function resolvePythonExecutable(
  projectRoot: string,
  options: ResolvePythonOptions = {},
): string {
  const platform = options.platform ?? process.platform;
  const exists = options.exists ?? existsSync;
  const env = options.env ?? process.env;

  if (env.ONESHOT_PYTHON) return env.ONESHOT_PYTHON;

  const venvPython =
    platform === "win32"
      ? resolve(projectRoot, ".venv", "Scripts", "python.exe")
      : resolve(projectRoot, ".venv", "bin", "python");
  if (exists(venvPython)) return venvPython;

  for (const command of ["python3", "python"]) {
    const onPath = findOnPath(command, platform, exists, env);
    if (onPath) return onPath;
  }
  return platform === "win32" ? "python" : "python3";
}