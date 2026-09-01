#!/usr/bin/env node
/**
 * OneShot single-command launcher.
 *
 * Clone -> npm run oneshot -> bootstrap -> build -> verify -> test -> serve
 * -> browser opens at http://localhost:8787
 */

import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname);
const environmentFile = join(ROOT, ".env");
if (existsSync(environmentFile)) {
  if (typeof process.loadEnvFile !== "function") {
    throw new Error(
      "ROOT_CAUSE: loading .env requires Node.js 20.12+; set variables in the process environment instead",
    );
  }
  process.loadEnvFile(environmentFile);
}
const PLATFORM_NAMES = {
  win32: "Windows",
  darwin: "macOS",
  linux: "Linux",
};
const platformName = PLATFORM_NAMES[process.platform];
const isWindows = process.platform === "win32";
const skipTests = process.argv.includes("--skip-tests");
const skipBrowser =
  process.argv.includes("--no-open") || process.env.ONESHOT_NO_OPEN === "1";
let runtimeChild = null;
let shuttingDown = false;

const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function header(title) {
  console.log(
    `\n${C.bold}${C.cyan}-- ${title} ${"-".repeat(Math.max(1, 60 - title.length))}${C.reset}`,
  );
}

function pass(message) {
  console.log(`  ${C.green}[PASS]${C.reset} ${message}`);
}

function info(message) {
  console.log(`  ${C.dim}[INFO]${C.reset} ${message}`);
}

function warn(message) {
  console.log(`  ${C.yellow}[SKIP]${C.reset} ${message}`);
}

function fail(message, detail) {
  if (runtimeChild && !runtimeChild.killed) runtimeChild.kill("SIGTERM");
  console.error(`\n${C.bold}${C.red}[FAIL] ${message}${C.reset}`);
  if (detail) console.error(String(detail).trim());
  process.exit(1);
}

function isBatchFile(cmd) {
  return typeof cmd === "string" && /\.(cmd|bat)$/i.test(cmd);
}

function run(command, args, options = {}) {
  const needsShell = isWindows && isBatchFile(command);
  const result = spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
    windowsHide: true,
    shell: needsShell,
    ...options,
  });
  if (result.error) {
    fail(options.label || `${command} failed to start`, result.error);
  }
  if (result.status !== 0) {
    fail(options.label || `${command} exited with code ${result.status}`);
  }
  return result;
}

function capture(command, args, options = {}) {
  const needsShell = isWindows && isBatchFile(command);
  return spawnSync(command, args, {
    cwd: ROOT,
    env: process.env,
    encoding: "utf8",
    input: options.input,
    maxBuffer: 20 * 1024 * 1024,
    windowsHide: true,
    shell: needsShell,
  });
}

function npmInvocation(args) {
  if (process.env.npm_execpath) {
    return {
      command: process.execPath,
      args: [process.env.npm_execpath, ...args],
    };
  }
  return { command: isWindows ? "npm.cmd" : "npm", args };
}

function runNpm(args, options = {}) {
  const invocation = npmInvocation(args);
  return run(invocation.command, invocation.args, options);
}

function captureNpm(args) {
  const invocation = npmInvocation(args);
  return capture(invocation.command, invocation.args);
}

function probePython(command, prefixArgs = []) {
  const result = capture(command, [
    ...prefixArgs,
    "-c",
    "import json,sys; print(json.dumps(list(sys.version_info[:3])))",
  ]);
  if (result.status !== 0) return null;
  try {
    const [major, minor, patch] = JSON.parse(result.stdout.trim());
    return { command, prefixArgs, major, minor, patch };
  } catch {
    return null;
  }
}

function findSystemPython() {
  const candidates = isWindows
    ? [
        ["python", []],
        ["py", ["-3"]],
        ["python3", []],
      ]
    : [
        ["python3", []],
        ["python", []],
      ];
  for (const [command, prefixArgs] of candidates) {
    const probe = probePython(command, prefixArgs);
    if (
      probe &&
      (probe.major > 3 || (probe.major === 3 && probe.minor >= 11))
    ) {
      return probe;
    }
  }
  return null;
}

function pythonVersion(probe) {
  return `${probe.major}.${probe.minor}.${probe.patch}`;
}

function verifyProfile(python, profile) {
  return capture(python, [
    "scripts/verify_dependencies.py",
    "--profile",
    profile,
  ]);
}

function ensurePythonProfile(python, profile, requirementsFile) {
  const current = verifyProfile(python, profile);
  if (current.status === 0) {
    pass(`Python dependency profile '${profile}' matches pinned requirements`);
    return;
  }

  info(`Installing pinned Python dependency profile '${profile}'...`);
  run(
    python,
    ["-m", "pip", "install", "--requirement", requirementsFile],
    { label: `Failed to install ${requirementsFile}` },
  );
  const verified = verifyProfile(python, profile);
  if (verified.status !== 0) {
    fail(
      `Python dependency profile '${profile}' does not match its pins`,
      verified.stdout || verified.stderr,
    );
  }
  pass(`Python dependency profile '${profile}' installed and verified`);
}

function ensureNodeDependencies(prefix, readyPath, label, offline = false) {
  const listing = captureNpm([...prefix, "ls", "--depth=0"]);
  if (existsSync(readyPath) && listing.status === 0) {
    pass(`${label} dependencies match the installed package tree`);
    return;
  }

  info(`Installing ${label} dependencies from the lockfile...`);
  const args = [...prefix, "ci"];
  if (offline) args.push("--offline", "--ignore-scripts");
  args.push("--no-audit", "--no-fund");
  runNpm(args, { label: `Failed to install ${label} dependencies` });

  const verified = captureNpm([...prefix, "ls", "--depth=0"]);
  if (verified.status !== 0) {
    fail(
      `${label} dependency tree is invalid`,
      verified.stdout || verified.stderr,
    );
  }
  pass(`${label} dependencies installed and verified`);
}

console.log(`
${C.bold}${C.cyan}ONESHOT${C.reset}
${C.magenta}Deterministic AI execution platform${C.reset}
`);

header("1. Environment and prerequisites");

if (!platformName) {
  fail(
    `Unsupported operating system '${process.platform}'. Expected Windows, macOS, or Linux.`,
  );
}
pass(`Operating system detected: ${platformName} (${process.platform})`);

const nodeMajor = Number.parseInt(process.versions.node.split(".")[0], 10);
if (!Number.isInteger(nodeMajor) || nodeMajor < 20) {
  fail(`Node.js 20+ is required. Current version: ${process.version}`);
}
pass(`Node.js ${process.version} satisfies the >=20 requirement`);

header("2. Python virtual environment and dependency profiles");

const venvDir = join(ROOT, ".venv");
const venvPython = isWindows
  ? join(venvDir, "Scripts", "python.exe")
  : join(venvDir, "bin", "python");

if (!existsSync(venvPython)) {
  const systemPython = findSystemPython();
  if (!systemPython) {
    fail(
      "Python 3.11+ is required but no compatible interpreter was found in PATH.",
    );
  }
  pass(
    `Python ${pythonVersion(systemPython)} found for virtual-environment creation`,
  );
  info("Creating .venv...");
  run(
    systemPython.command,
    [...systemPython.prefixArgs, "-m", "venv", venvDir],
    { label: "Failed to create .venv" },
  );
  pass(".venv created");
}

const activePython = probePython(venvPython);
if (!activePython) {
  fail(`The virtual-environment interpreter is not runnable: ${venvPython}`);
}
if (
  activePython.major < 3 ||
  (activePython.major === 3 && activePython.minor < 11)
) {
  fail(
    `Python 3.11+ is required. .venv currently uses Python ${pythonVersion(activePython)}.`,
  );
}
pass(
  `Python ${pythonVersion(activePython)} in .venv satisfies the >=3.11 requirement`,
);

const mode = (process.env.ONESHOT_MODE || "sample").toLowerCase();
const providerKey = (
  process.env.ONESHOT_RESEARCH_PROVIDER ||
  (mode === "sample" ? "" : "adk_gemma2")
).toLowerCase();
const profiles = [
  ["base", "requirements.txt"],
  ["workspace", "requirements-workspace-api.txt"],
];
if (["adk_gemma2", "google_adk_gemma2"].includes(providerKey)) {
  profiles.push(["adk", "requirements-adk.txt"]);
} else if (["featherless", "featherless_gemma4"].includes(providerKey)) {
  profiles.push(["featherless", "requirements-featherless.txt"]);
}
for (const [profile, requirementsFile] of profiles) {
  ensurePythonProfile(venvPython, profile, requirementsFile);
}

header("3. Node dependency installation");

ensureNodeDependencies(
  [],
  join(
    ROOT,
    "node_modules",
    ".bin",
    isWindows ? "tsc.cmd" : "tsc",
  ),
  "root",
  true,
);
ensureNodeDependencies(
  ["--prefix", "web"],
  join(
    ROOT,
    "web",
    "node_modules",
    ".bin",
    isWindows ? "vite.cmd" : "vite",
  ),
  "web",
);

header("4. Backend and React IDE builds");

runNpm(["run", "build:backend"], {
  label: "Backend TypeScript build failed",
});
pass("Backend TypeScript compiled to dist/");
runNpm(["run", "build:ui"], { label: "OneShot React IDE build failed" });
pass("OneShot React IDE compiled to web/dist/");

header("5. Canonical contracts and manifest verification");

const contracts = capture(
  venvPython,
  ["-m", "validation.cli", "verify-static"],
  { input: "{}\n" },
);
if (contracts.status !== 0) {
  fail(
    "Canonical contract verification failed",
    contracts.stdout || contracts.stderr,
  );
}
try {
  const result = JSON.parse(contracts.stdout.trim());
  if (result.valid !== true) {
    fail("Canonical contract verification returned NOT_VALID", contracts.stdout);
  }
} catch (error) {
  fail("Canonical contract verifier returned invalid output", error);
}
pass("Canonical registry, schemas, and workflow graph verified");

run(venvPython, ["scripts/verify_manifest.py"], {
  label:
    "MANIFEST.sha256 verification failed; regenerate it only after reviewing the intended source changes",
});
pass("MANIFEST.sha256 verified against the current source tree");

header("6. Automated test suites");

if (skipTests) {
  warn("Automated tests were explicitly skipped with --skip-tests");
} else {
  info("Running the authoritative Python and TypeScript verification suite...");
  const tests = capture(venvPython, ["scripts/verify_all.py"]);
  const testOutput = `${tests.stdout || ""}\n${tests.stderr || ""}`;
  if (tests.status !== 0) {
    fail("Automated verification suite failed", testOutput);
  }

  const pythonMatch = testOutput.match(/Ran\s+(\d+)\s+tests/);
  const testSummaries = [...testOutput.matchAll(/\btests\s+(\d+)\b/g)];
  const typeScriptCount = testSummaries.length
    ? Number.parseInt(testSummaries.at(-1)[1], 10)
    : Number.NaN;
  const pythonCount = pythonMatch
    ? Number.parseInt(pythonMatch[1], 10)
    : Number.NaN;
  if (pythonCount !== 47 || typeScriptCount !== 47) {
    fail(
      `Expected 47 Python and 47 TypeScript tests; observed Python=${pythonCount}, TypeScript=${typeScriptCount}`,
    );
  }
  if (!testOutput.includes("ONESHOT_PRODUCTION_E2E_VERIFIED")) {
    fail("The verification suite did not emit ONESHOT_PRODUCTION_E2E_VERIFIED");
  }
  pass("47 / 47 Python tests passed");
  pass("47 / 47 TypeScript tests passed");
  pass("94 / 94 total tests passed");
}

header("7. Runtime service startup");

const port = process.env.PORT || "8787";
const bindHost = (process.env.ONESHOT_BIND_HOST || "127.0.0.1").trim() || "127.0.0.1";
const probeHost = bindHost === "0.0.0.0" ? "127.0.0.1" : bindHost === "::" ? "::1" : bindHost;
const apiToken = (process.env.ONESHOT_API_TOKEN || "").trim();
const providerDisplay =
  mode === "sample" ? "deterministic sample provider" : providerKey;
info(`Mode: ${mode}`);
info(`Provider: ${providerDisplay}`);
info(`Target: http://localhost:${port}`);

const runtimeEnv = {
  ...process.env,
  PORT: port,
  ONESHOT_MODE: mode,
};
if (providerKey) runtimeEnv.ONESHOT_RESEARCH_PROVIDER = providerKey;

runtimeChild = spawn(process.execPath, ["dist/backend/index.js"], {
  cwd: ROOT,
  env: runtimeEnv,
  stdio: ["inherit", "pipe", "pipe"],
  windowsHide: true,
});

runtimeChild.stdout.on("data", (data) => {
  process.stdout.write(`  ${C.dim}[backend]${C.reset} ${data}`);
});
runtimeChild.stderr.on("data", (data) => {
  process.stderr.write(`  ${C.red}[backend]${C.reset} ${data}`);
});
runtimeChild.on("error", (error) => {
  fail("Failed to start the OneShot backend", error);
});
runtimeChild.on("exit", (code, signal) => {
  if (!shuttingDown) {
    fail(
      `OneShot backend exited unexpectedly (code=${code}, signal=${signal || "none"})`,
    );
  }
});

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n${C.cyan}Shutting down OneShot services...${C.reset}`);
  if (runtimeChild && !runtimeChild.killed) runtimeChild.kill("SIGTERM");
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

header("8. Health check and browser launch");

function pollHealth(targetPort, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolveHealth, rejectHealth) => {
    const retry = () => {
      if (Date.now() >= deadline) {
        rejectHealth(
          new Error(
            `Timed out waiting for http://localhost:${targetPort}/api/health`,
          ),
        );
        return;
      }
      setTimeout(attempt, 200);
    };

    const attempt = () => {
      const request = http.get(
        {
          host: probeHost,
          port: targetPort,
          path: "/api/health",
          headers: apiToken
            ? { Authorization: `Bearer ${apiToken}` }
            : undefined,
        },
        (response) => {
          let body = "";
          response.on("data", (chunk) => {
            body += chunk;
          });
          response.on("end", () => {
            if (response.statusCode === 200) {
              try {
                const parsed = JSON.parse(body);
                if (parsed.status === "ok") {
                  resolveHealth(parsed);
                  return;
                }
              } catch {}
            }
            retry();
          });
        },
      );
      request.on("error", () => {
        retry();
      });
      request.setTimeout(1000, () => {
        request.destroy();
        retry();
      });
    };

    attempt();
  });
}

const health = await pollHealth(port);
pass(`http://localhost:${port}/api/health reports status='${health.status}'`);

header("9. OneShot React IDE ready");
console.log(`
${C.bold}${C.green}OneShot React IDE is running.${C.reset}
${C.bold}URL:${C.reset}      http://localhost:${port}
${C.bold}Mode:${C.reset}     ${mode.toUpperCase()}
${C.bold}Provider:${C.reset} ${providerDisplay}
${C.bold}Health:${C.reset}   http://localhost:${port}/api/health
${C.bold}Graph:${C.reset}    http://localhost:${port}/api/graphs/adk
${C.dim}Press Ctrl+C to stop the services.${C.reset}
`);

if (!skipBrowser) {
  info("Opening OneShot in your default browser...");
  const opener = isWindows ? "start" : process.platform === "darwin" ? "open" : "xdg-open";
  spawn(opener, [`http://localhost:${port}`], {
    shell: true,
    detached: true,
    stdio: "ignore",
  });
}
