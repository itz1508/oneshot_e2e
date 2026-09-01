import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";

export type RuntimePathSource = "explicit" | "environment" | "module" | "project";

export interface RuntimePathTrace {
  projectRootSource: RuntimePathSource;
  workspaceRootSource: RuntimePathSource;
  environmentFile: string;
}

export interface RuntimePaths {
  projectRoot: string;
  workspaceRoot: string;
  dataRoot: string;
  taskEventsRoot: string;
  runStateRoot: string;
  checkpointsRoot: string;
  conversationsRoot: string;
  artifactRunsRoot: string;
  sandboxWorkspacesRoot: string;
  webDistRoot: string;
  legacyUiRoot: string;
  skillRoot: string;
  fixtureFile: string;
  trace: RuntimePathTrace;
}

export interface ResolveRuntimePathsOptions {
  projectRoot?: string;
  workspaceRoot?: string;
  startDirectory?: string;
  env?: NodeJS.ProcessEnv;
}

function canonicalExistingDirectory(path: string): string {
  const normalized = resolve(path);
  return existsSync(normalized) ? realpathSync.native(normalized) : normalized;
}

/** Find the repository root without depending on the process working directory. */
export function findProjectRoot(startDirectory = import.meta.dirname): string {
  let current = canonicalExistingDirectory(startDirectory);
  for (;;) {
    if (
      existsSync(join(current, "package.json")) &&
      existsSync(join(current, "backend")) &&
      existsSync(join(current, "schema"))
    ) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        `ROOT_CAUSE: unable to locate the OneShot project root from ${startDirectory}`,
      );
    }
    current = parent;
  }
}

function resolveFromProject(projectRoot: string, value: string): string {
  return canonicalExistingDirectory(
    isAbsolute(value) ? value : resolve(projectRoot, value),
  );
}

/** Resolve every runtime filesystem location from one canonical project root. */
export function resolveRuntimePaths(
  options: ResolveRuntimePathsOptions = {},
): RuntimePaths {
  const env = options.env ?? process.env;
  const configuredProjectRoot = options.projectRoot ?? env.ONESHOT_ROOT;
  const detectedProjectRoot = (): string =>
    findProjectRoot(options.startDirectory ?? import.meta.dirname);
  const projectRootSource: RuntimePathSource = options.projectRoot
    ? "explicit"
    : env.ONESHOT_ROOT
      ? "environment"
      : "module";
  const projectRoot = configuredProjectRoot
    ? resolveFromProject(
        isAbsolute(configuredProjectRoot)
          ? configuredProjectRoot
          : detectedProjectRoot(),
        configuredProjectRoot,
      )
    : detectedProjectRoot();

  const configuredWorkspaceRoot = options.workspaceRoot ?? env.ONESHOT_WORKSPACE_ROOT;
  const workspaceRootSource: RuntimePathSource = options.workspaceRoot
    ? "explicit"
    : env.ONESHOT_WORKSPACE_ROOT
      ? "environment"
      : "project";
  const workspaceRoot = resolveFromProject(
    projectRoot,
    configuredWorkspaceRoot || ".",
  );
  const dataRoot = join(projectRoot, "data");

  return {
    projectRoot,
    workspaceRoot,
    dataRoot,
    taskEventsRoot: join(dataRoot, "task-events"),
    runStateRoot: join(dataRoot, "run-state"),
    checkpointsRoot: join(dataRoot, "checkpoints"),
    conversationsRoot: join(dataRoot, "conversations"),
    artifactRunsRoot: join(dataRoot, "runs"),
    sandboxWorkspacesRoot: join(dataRoot, "sandbox-workspaces"),
    webDistRoot: join(projectRoot, "web", "dist"),
    legacyUiRoot: join(projectRoot, "ui"),
    skillRoot: join(projectRoot, "skill"),
    fixtureFile: join(
      projectRoot,
      "fixtures",
      "product",
      "complete-success-seed.json",
    ),
    trace: {
      projectRootSource,
      workspaceRootSource,
      environmentFile: join(projectRoot, ".env"),
    },
  };
}
