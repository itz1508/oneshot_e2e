import { existsSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { ToolRegistry } from "../tool/registry.js";
import { getRuntimePaths } from "../runtime/runtime-config.js";

export interface WorkspaceInitResult {
  initialized: boolean;
  directories_created: string[];
  root: string;
}

export interface PreflightCheckResult {
  healthy: boolean;
  checks: Array<{ name: string; passed: boolean; message: string }>;
  timestamp: string;
}

/**
 * Reusable Init Skill Runtime — provisions required runtime directories
 * and performs non-destructive environment diagnostics.
 */
export class InitSkill {
  private registry = new ToolRegistry();

  constructor() {
    this.registry.register(
      {
        name: "init_workspace",
        description: "Provision required OneShot runtime data directories",
      },
      async (input: { root?: string } = {}): Promise<WorkspaceInitResult> => {
        const root = resolve(input.root || process.env.ONESHOT_ROOT || process.cwd());
        const runtimePaths = getRuntimePaths(root);
        const dirs = [
          { path: runtimePaths.runs, name: "runs" },
          { path: runtimePaths.runState, name: "run-state" },
          { path: runtimePaths.taskEvents, name: "task-events" },
          { path: runtimePaths.checkpoints, name: "checkpoints" },
          { path: runtimePaths.conversations, name: "conversations" },
          { path: runtimePaths.sandboxWorkspaces, name: "sandbox-workspaces" },
        ];

        const created: string[] = [];
        for (const dir of dirs) {
          if (!existsSync(dir.path)) {
            mkdirSync(dir.path, { recursive: true });
            created.push(dir.name);
          }
        }

        return {
          initialized: true,
          directories_created: created,
          root,
        };
      },
    );

    this.registry.register(
      {
        name: "check_preflight",
        description: "Verify environment configuration, node/python runtime, and schemas",
      },
      async (input: { root?: string } = {}): Promise<PreflightCheckResult> => {
        const root = resolve(input.root || process.env.ONESHOT_ROOT || process.cwd());
        const checks: PreflightCheckResult["checks"] = [];

        // Check 1: Schema directory
        const schemaDir = join(root, "backend/schema");
        checks.push({
          name: "schema_directory_exists",
          passed: existsSync(schemaDir),
          message: existsSync(schemaDir)
            ? `Found schema directory at ${schemaDir}`
            : `Schema directory missing at ${schemaDir}`,
        });

        // Check 2: Node environment
        checks.push({
          name: "node_version",
          passed: parseInt(process.versions.node.split(".")[0], 10) >= 20,
          message: `Node.js version is ${process.version}`,
        });

        // Check 3: Contract registry
        const registryFile = join(root, "app/contract-registry.json");
        checks.push({
          name: "contract_registry_exists",
          passed: existsSync(registryFile),
          message: existsSync(registryFile)
            ? "contract-registry.json is present"
            : "contract-registry.json is missing",
        });

        const healthy = checks.every((c) => c.passed);
        return {
          healthy,
          checks,
          timestamp: new Date().toISOString(),
        };
      },
    );
  }

  async invoke<T>(name: string, input: unknown): Promise<T> {
    return (await this.registry.invoke(name, input)) as T;
  }

  definitions() {
    return this.registry.definitions();
  }
}
