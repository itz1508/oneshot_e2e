import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { integrationPackageSpec } from "./catalog.js";
import { integrationDirectory, integrationStatus } from "./runtime.js";

export interface InstallIntegrationResult {
  id: string;
  packageName: string;
  packageVersion: string;
  installDirectory: string;
  installed: boolean;
}

export function integrationInstallCommand(
  projectRoot: string,
  integrationId: string,
): { command: string; args: string[]; cwd: string } {
  const spec = integrationPackageSpec(integrationId);
  const target = integrationDirectory(projectRoot, integrationId);
  return {
    command: process.platform === "win32" ? "npm.cmd" : "npm",
    args: [
      "install",
      "--prefix",
      target,
      "--ignore-scripts",
      "--save-exact",
      `${spec.packageName}@${spec.packageVersion}`,
    ],
    cwd: projectRoot,
  };
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      if (stderr.length < 32_768) stderr += chunk;
    });
    child.on("error", rejectPromise);
    child.on("close", (code) => {
      if (code === 0) return resolvePromise();
      rejectPromise(
        new Error(
          `integration package install failed (exit ${code ?? "unknown"})${stderr.trim() ? `: ${stderr.trim()}` : ""}`,
        ),
      );
    });
  });
}

export async function installIntegration(
  projectRoot: string,
  integrationId: string,
): Promise<InstallIntegrationResult> {
  const spec = integrationPackageSpec(integrationId);
  const target = integrationDirectory(projectRoot, integrationId);
  await mkdir(target, { recursive: true });

  // The integration folder is runtime package storage. It contains no
  // OneShot-authored Gemini/OpenAI/etc implementation code.
  await writeFile(
    join(target, "package.json"),
    JSON.stringify(
      {
        name: `@oneshot/runtime-integration-${spec.id}`,
        private: true,
        version: "0.0.0",
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  const command = integrationInstallCommand(projectRoot, integrationId);
  await run(command.command, command.args, command.cwd);

  const status = await integrationStatus(projectRoot, spec);
  if (!status.installed) {
    throw new Error(
      `integration package install completed but package was not found: ${spec.packageName}`,
    );
  }

  return {
    id: spec.id,
    packageName: spec.packageName,
    packageVersion: spec.packageVersion,
    installDirectory: target,
    installed: true,
  };
}
