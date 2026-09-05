import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile, writeFile, readdir } from "node:fs/promises";
import {
  extname,
  join,
  normalize,
  resolve,
} from "node:path";
import type { Prompt, RootCause } from "../contracts/schema/types.js";
import { id, newRunId } from "../core/id.js";
import { RunRepository } from "../runtime/run-repository.js";
import { ProcessingEventBus } from "../runtime/event-bus.js";
import { WorkflowRuntime } from "../runtime/workflow-runtime.js";
import type { TaskManagement } from "../task/task-management.js";
import { QUEUE_PREFIX, RUN_QUEUE_NAME, type RunQueue } from "../runtime/queue.js";
import type { ProviderManager } from "../runtime/provider-manager.js";
import type { ProviderRuntimeSettings } from "../runtime/provider-runtime-config.js";
import type { ResearchToolsConfig } from "../runtime/provider-runtime-config.js";
import type { ProviderCredential } from "../runtime/provider-secret-store.js";
import { projectAdkGraph } from "../graph/adk-graph.js";
import { projectAuthorityGraph } from "../graph/authority-graph.js";
import { projectIntentGraph } from "../graph/intent-graph.js";
import type { IntentCollectionService } from "../intent/intent-collection.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import { projectSandboxGraph } from "../sandbox/graph/sandbox-graph.js";
import type { SandboxExecutionInput } from "../sandbox/types.js";
import { HttpSecurity } from "./http-security.js";
import {
  WorkspacePathDeniedError,
  WorkspacePathPolicy,
  WorkspacePathTraversalError,
  isSensitiveWorkspacePath,
} from "./workspace-path-policy.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}

function json(
  res: ServerResponse,
  status: number,
  value: unknown,
): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}

/**
 * Mark a run as failed/queue-unavailable when ONESHOT_QUEUE_REQUIRED is active
 * and BullMQ/Redis could not accept the job. The run is finalized as ROOT_CAUSE
 * so it never lingers as a permanent "queued" ghost. No secrets in the event.
 */
function markRunQueueUnavailable(
  runId: string,
  runs: RunRepository,
  events: ProcessingEventBus,
): void {
  const rootCause: RootCause = {
    issue: "runtime queue unavailable",
    expected: "Redis/BullMQ available to accept the run job",
    actual:
      "Queue unavailable with ONESHOT_QUEUE_REQUIRED=true (no silent inline execution outside BullMQ)",
    evidence_ids: [],
    required_correction:
      "Start Redis/BullMQ, or set ONESHOT_QUEUE_REQUIRED=false for local inline execution",
    recheck_target: runId,
  };
  const snap = runs.get(runId);
  if (snap && !snap.result) {
    runs.finish(runId, "ROOT_CAUSE", undefined, rootCause);
  }
  events.emit(runId, "RunWorker", "COMPLETE", {
    scope: "SUPPORT",
    result: "ROOT_CAUSE",
    message: "runtime queue unavailable",
  });
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};
const mime = (p: string) => MIME[extname(p)] || "application/octet-stream";

function workspacePolicyError(
  res: ServerResponse,
  error: unknown,
): boolean {
  if (error instanceof WorkspacePathTraversalError) {
    json(res, 400, { error: error.message });
    return true;
  }
  if (error instanceof WorkspacePathDeniedError) {
    json(res, 403, { error: error.message });
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Workspace Filesystem Inspection Helpers
// ---------------------------------------------------------------------------

interface TreeNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: TreeNode[];
}

async function buildFileTree(
  policy: WorkspacePathPolicy,
  requestedDir: string,
  basePath = "",
  currentDepth = 0,
  maxDepth?: number,
): Promise<TreeNode[]> {
  if (maxDepth !== undefined && currentDepth >= maxDepth) return [];
  try {
    const dir = await policy.authorizeExisting(requestedDir);
    const entries = await readdir(dir, { withFileTypes: true });
    const nodes: TreeNode[] = [];

    for (const entry of entries) {
      const relPath = basePath ? `${basePath}/${entry.name}` : entry.name;
      const policyPath =
        requestedDir === "."
          ? entry.name
          : `${requestedDir}/${entry.name}`;

      try {
        await policy.authorizeExisting(policyPath);
      } catch (error) {
        if (
          error instanceof WorkspacePathDeniedError ||
          error instanceof WorkspacePathTraversalError
        ) {
          continue;
        }
        throw error;
      }

      if (entry.isDirectory()) {
        const children = await buildFileTree(
          policy,
          policyPath,
          relPath,
          currentDepth + 1,
          maxDepth,
        );
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "folder",
          children,
        });
      } else if (entry.isFile()) {
        nodes.push({
          name: entry.name,
          path: relPath,
          type: "file",
        });
      }
    }
    return nodes.sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  } catch (error) {
    if (
      error instanceof WorkspacePathDeniedError ||
      error instanceof WorkspacePathTraversalError
    ) {
      throw error;
    }
    return [];
  }
}

// ---------------------------------------------------------------------------
// HTTP server
// ---------------------------------------------------------------------------

export interface RuntimeInfo {
  mode: string;
  provider: string;
  /** Whether the BullMQ run queue (Redis) is available. */
  queue?: boolean;
}

export interface HttpServerOptions {
  workspaceRoot?: string;
}

export async function startHttpServer(
  runtime: WorkflowRuntime,
  runs: RunRepository,
  events: ProcessingEventBus,
  uiRoot: string,
  port = Number(process.env.PORT || 8787),
  task?: TaskManagement,
  intent?: IntentCollectionService,
  sandbox?: SandboxService,
  runtimeInfo?: RuntimeInfo,
  options: HttpServerOptions = {},
  /**
   * Optional BullMQ run queue. When present, `POST /api/runs` enqueues the run
   * instead of executing inline. When absent (e.g. tests), runs execute inline
   * via `runtime`, preserving the original behavior.
   */
  runQueue?: RunQueue,
  providerManager?: ProviderManager,
  queueReady?: boolean,
): Promise<ReturnType<typeof createServer>> {
  const bindHost = (process.env.ONESHOT_BIND_HOST || "127.0.0.1").trim() || "127.0.0.1";
  const apiToken = (process.env.ONESHOT_API_TOKEN || "").trim();
  if (bindHost !== "127.0.0.1" && bindHost !== "::1" && !apiToken) {
    throw new Error(
      `ROOT_CAUSE: non-loopback ONESHOT_BIND_HOST '${bindHost}' requires ONESHOT_API_TOKEN`,
    );
  }
  const security = new HttpSecurity();
  const workspaceRoot = resolve(
    options.workspaceRoot || process.env.ONESHOT_WORKSPACE_ROOT || process.cwd(),
  );
  const workspacePolicy = await WorkspacePathPolicy.create(workspaceRoot);

  const server = createServer(
    async (req: IncomingMessage, res: ServerResponse) => {
      security.headers(res);
      if (!security.allowed(req, res)) return;

      try {
        const url = new URL(req.url || "/", "http://localhost");


        // ---------------------------------------------------------------
        // Workspace Tree & File Endpoints (for OneShot IDE Explorer & Viewer)
        // ---------------------------------------------------------------
        if (
          req.method === "GET" &&
          (url.pathname === "/v1/workspace/tree" ||
            url.pathname === "/api/workspace/tree")
        ) {
          const reqPath = url.searchParams.get("path") || ".";
          const depthParam = url.searchParams.get("depth");
          const maxDepth = depthParam === null ? undefined : Number(depthParam);
          if (
            maxDepth !== undefined &&
            (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > 100)
          ) {
            return json(res, 400, {
              error: "depth must be an integer from 1 to 100",
            });
          }
          try {
            const nodes = await buildFileTree(workspacePolicy, reqPath, "", 0, maxDepth);
            return json(res, 200, {
              root: reqPath,
              path: reqPath,
              depth: maxDepth ?? null,
              nodes,
            });
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            throw error;
          }
        }

        if (
          req.method === "GET" &&
          (url.pathname === "/v1/workspace/file" ||
            url.pathname === "/api/workspace/file")
        ) {
          const reqPath = url.searchParams.get("path") || "";
          if (!reqPath) return json(res, 400, { error: "path parameter required" });
          try {
            const targetFile = await workspacePolicy.authorizeExisting(reqPath);
            const data = await readFile(targetFile, "utf-8");
            return json(res, 200, { path: reqPath, content: data });
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            return json(res, 404, { error: `File not found: ${reqPath}` });
          }
        }

        if (
          req.method === "POST" &&
          (url.pathname === "/v1/workspace/file" ||
            url.pathname === "/api/workspace/file")
        ) {
          const b = await body(req);
          const filePath = String(b.path || "");
          const content = String(b.content ?? "");
          if (!filePath) return json(res, 400, { error: "path parameter required" });
          try {
            const targetFile = await workspacePolicy.authorizeWrite(filePath);
            await writeFile(targetFile, content, "utf-8");
            return json(res, 200, { ok: true, path: filePath });
          } catch (error) {
            if (workspacePolicyError(res, error)) return;
            throw error;
          }
        }

        if (
          req.method === "GET" &&
          (url.pathname === "/v1/status" || url.pathname === "/api/status")
        ) {
          return json(res, 200, {
            statuses: [],
            total: 0,
            color_summary: {},
            cached: false,
          });
        }

        // ---------------------------------------------------------------
        // Health
        // ---------------------------------------------------------------
                if (req.method === "GET" && url.pathname === "/api/health") {
          const mode = runtimeInfo?.mode || process.env.ONESHOT_MODE || "sample";
          const redis: "ok" | "unavailable" | "disabled" = !runQueue
            ? "disabled"
            : queueReady
              ? "ok"
              : "unavailable";
          const queue: "ok" | "unavailable" | "disabled" = !runQueue
            ? "disabled"
            : queueReady
              ? "ok"
              : "unavailable";
          const worker: "ok" | "degraded" | "disabled" = !runQueue
            ? "disabled"
            : queueReady
              ? "ok"
              : "degraded";
          // Be precise: Sample Mode is valid without production credentials —
          // do not mark the server unhealthy just because Featherless is unset.
          let providerConfiguration:
            | "ready"
            | "sample"
            | "degraded"
            | "disabled" = "disabled";
          if (providerManager) {
            try {
              const rc = providerManager.runtimeConfig();
              const activeId = rc.activeProvider || "sample";
              if (activeId === "sample" || mode === "sample") {
                providerConfiguration = "sample";
              } else {
                const status = await providerManager.get(activeId);
                providerConfiguration = status?.configured
                  ? "ready"
                  : "degraded";
              }
            } catch {
              providerConfiguration = "degraded";
            }
          }
          const infraOk =
            (redis === "ok" || redis === "disabled") &&
            (queue === "ok" || queue === "disabled") &&
            (worker === "ok" || worker === "disabled");
          const status =
            infraOk && providerConfiguration !== "degraded" ? "ok" : "degraded";
          return json(res, 200, {
            status,
            workflow: "oneshot-canonical-workflow",
            mode,
            provider: runtimeInfo?.provider || "unknown",
            redis,
            queue,
            worker,
            providerConfiguration,
            run_queue: {
              enabled: Boolean(runQueue),
              redis_available: queueReady ?? false,
            },
            task_management: Boolean(task),
            intent_collection: Boolean(intent),
            sandbox_service: Boolean(sandbox),
            provider_management: Boolean(providerManager),
            adk_graph: "oneshot-adk-researcher-v1",
            authority_graph: "oneshot-authority-trace-v1",
            sandbox_graph: "oneshot-sandbox-execution-v1",
          });
        }

        // ---------------------------------------------------------------
        // Queue status (operational; never exposes Redis host/credentials)
        // ---------------------------------------------------------------
        if (req.method === "GET" && url.pathname === "/api/runtime/queue") {
          const backend = "bullmq";
          const queueName = `${QUEUE_PREFIX}:${RUN_QUEUE_NAME}`;
          if (!runQueue) {
            return json(res, 200, {
              available: false,
              backend,
              redis: "disabled",
              queue: queueName,
              waiting: 0,
              active: 0,
              failed: 0,
            });
          }
          let redis: "ok" | "unavailable" = queueReady ? "ok" : "unavailable";
          let waiting = 0;
          let active = 0;
          let failed = 0;
          if (queueReady && runQueue.getJobCounts) {
            try {
              const c = await runQueue.getJobCounts();
              waiting = c.waiting;
              active = c.active;
              failed = c.failed;
            } catch {
              redis = "unavailable";
            }
          }
          return json(res, 200, {
            available: queueReady && redis === "ok",
            backend,
            redis,
            queue: queueName,
            waiting,
            active,
            failed,
          });
        }

        // ---------------------------------------------------------------
        // Static graphs (no run context)
        // ---------------------------------------------------------------
        if (req.method === "GET" && url.pathname === "/api/graphs/adk") {
          return json(res, 200, projectAdkGraph());
        }
        if (req.method === "GET" && url.pathname === "/api/graphs/authority") {
          return json(res, 200, projectAuthorityGraph());
        }
        if (req.method === "GET" && url.pathname === "/api/graphs/sandbox") {
          return json(res, 200, projectSandboxGraph());
        }

        // ---------------------------------------------------------------
        // Conversation / Intent endpoints
        // ---------------------------------------------------------------

        // POST /api/conversations — start a new conversation
        if (req.method === "POST" && url.pathname === "/api/conversations") {
          if (!intent) return json(res, 503, { error: "intent collection unavailable" });
          const input = await body(req);
          const c = intent.start(
            String(input.message || input.user_message || ""),
          );
          return json(res, 201, c);
        }

        // POST /api/conversations/:id/messages — add a turn
        const convMsg = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/messages$/,
        );
        if (req.method === "POST" && convMsg) {
          if (!intent) return json(res, 503, { error: "intent collection unavailable" });
          const input = await body(req);
          try {
            return json(
              res,
              200,
              intent.addTurn(
                decodeURIComponent(convMsg[1]),
                String(input.message || input.user_message || ""),
              ),
            );
          } catch (e) {
            return json(res, 404, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/conversations/:id/prompt — attempt prompt creation
        const convPrompt = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/prompt$/,
        );
        if (req.method === "POST" && convPrompt) {
          if (!intent) return json(res, 503, { error: "intent collection unavailable" });
          const cid = decodeURIComponent(convPrompt[1]);
          try {
            const r = intent.createPrompt(cid, id("prompt", cid));
            return json(res, r.result === "PASSED" ? 200 : 409, r);
          } catch (e) {
            return json(res, 404, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/conversations/:id/run — create prompt and start workflow
        const convRun = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/run$/,
        );
        if (req.method === "POST" && convRun) {
          if (!intent) return json(res, 503, { error: "intent collection unavailable" });
          const cid = decodeURIComponent(convRun[1]);
          const runId = newRunId();

          let made;
          try {
            made = intent.createPrompt(cid, id("prompt", runId));
          } catch (e) {
            return json(res, 404, {
              error: e instanceof Error ? e.message : String(e),
            });
          }

          if (made.result !== "PASSED") return json(res, 409, made);

          runs.create(runId);
          void runtime.run(runId, made.prompt);
          return json(res, 202, {
            run_id: runId,
            prompt_id: made.prompt.prompt_id,
            intent_id: made.intent.intent_id,
            intent_revision: made.intent.revision,
          });
        }

        // GET /api/conversations/:id/graph — intent graph projection
        const convGraph = url.pathname.match(
          /^\/api\/conversations\/([^/]+)\/graph$/,
        );
        if (req.method === "GET" && convGraph) {
          if (!intent) return json(res, 503, { error: "intent collection unavailable" });
          return json(
            res,
            200,
            projectIntentGraph(
              intent.get(decodeURIComponent(convGraph[1])),
            ),
          );
        }

        // GET /api/conversations/:id — get conversation snapshot
        const convGet = url.pathname.match(
          /^\/api\/conversations\/([^/]+)$/,
        );
        if (req.method === "GET" && convGet) {
          if (!intent) return json(res, 503, { error: "intent collection unavailable" });
          const c = intent.get(decodeURIComponent(convGet[1]));
          return c
            ? json(res, 200, c)
            : json(res, 404, { error: "conversation not found" });
        }

        // ---------------------------------------------------------------
        // Run endpoints
        // ---------------------------------------------------------------

        // POST /api/runs — start a new run (direct prompt, no conversation)
        if (req.method === "POST" && url.pathname === "/api/runs") {
          const input = await body(req);
          const runId = newRunId();
          runs.create(runId);

          const prompt: Prompt = {
            prompt_id: id("prompt", runId),
            intent: String(
              input.intent || "Run canonical success sample",
            ),
            requested_outcome: String(
              input.requested_outcome ||
                "Execute the complete canonical workflow through DONE",
            ),
            context: [
              {
                context_id: id("ctx", runId),
                statement: String(
                  input.context ||
                    "Fresh OneShot canonical product runtime",
                ),
              },
            ],
            research_direction: Array.isArray(input.research_direction)
              ? input.research_direction.map(String)
              : ["contracts", "proof"],
          };

          // Queue submission policy. ONESHOT_QUEUE_REQUIRED=true makes BullMQ
          // mandatory: if Redis is down at submission, return 503 and mark the
          // run failed/queue-unavailable (no ghost run, no silent inline exec).
          // Default (unset/false) keeps the local-dev inline fallback so runs are
          // never lost and existing tests keep working without Redis.
          const queueRequired = process.env.ONESHOT_QUEUE_REQUIRED === "true";
          const enqueueInputs = (): {
            providerId: string;
            revision: number;
            model?: string;
          } => {
            let providerId = "sample";
            let revision = 0;
            let model: string | undefined;
            if (providerManager) {
              try {
                const rc = providerManager.runtimeConfig();
                providerId = rc.activeProvider || "sample";
                revision = rc.revision ?? 0;
                const rt = rc.providers[providerId];
                model =
                  rt?.model && rt.model !== "fixture" ? rt.model : undefined;
              } catch {
                providerId = "sample";
              }
            }
            return { providerId, revision, model };
          };

          if (runQueue && queueReady) {
            const { providerId, revision, model } = enqueueInputs();
            try {
              await runQueue.addRun({ runId, prompt, providerId, revision, model });
              return json(res, 202, { run_id: runId, queued: true });
            } catch {
              // Enqueue failed AFTER the run record was created.
              if (queueRequired) {
                markRunQueueUnavailable(runId, runs, events);
                return json(res, 503, {
                  error: "runtime queue unavailable",
                  run_id: runId,
                });
              }
              // Local-dev fallback (queue not required): execute inline.
              void runtime.run(runId, prompt);
              return json(res, 202, { run_id: runId, queued: false });
            }
          }

          if (runQueue && !queueReady && queueRequired) {
            // Redis unavailable at submission and BullMQ is required → 503.
            markRunQueueUnavailable(runId, runs, events);
            return json(res, 503, {
              error: "runtime queue unavailable",
              run_id: runId,
            });
          }

          // No queue, or queue-not-required + not ready → inline execution.
          void runtime.run(runId, prompt);
          return json(res, 202, { run_id: runId });
        }

        // ---------------------------------------------------------------
        // Run cancellation — DELETE /api/runs/:id
        // Distinguishes queued-job cancellation from active-workflow
        // cancellation and from browser SSE disconnect. Closing the browser
        // only unsubscribes SSE (see the events handler) — it NEVER cancels
        // the BullMQ job. Active cancellation is NOT supported until
        // WorkflowRuntime supports cooperative cancellation; report honestly.
        // ---------------------------------------------------------------
        const runCancel = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
        if (req.method === "DELETE" && runCancel) {
          const runId = decodeURIComponent(runCancel[1]);
          const snap = runs.get(runId);
          if (!snap) return json(res, 404, { error: "run not found" });
          if (!runQueue) {
            return json(res, 501, {
              error: "cancellation not available (run queue disabled)",
              run_id: runId,
            });
          }
          try {
            const job = await runQueue.getJob(runId);
            if (!job) {
              return json(res, 200, {
                run_id: runId,
                canceled: false,
                state: snap.result ? "terminal" : "not-queued",
              });
            }
            const state = await runQueue.getJobState(runId);
            if (state === "waiting" || state === "delayed") {
              await job.remove();
              return json(res, 200, {
                run_id: runId,
                canceled: true,
                state: "queued",
              });
            }
            if (state === "active") {
              return json(res, 501, {
                error: "active cancellation not supported",
                run_id: runId,
                state: "active",
              });
            }
            return json(res, 200, {
              run_id: runId,
              canceled: false,
              state,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // ---------------------------------------------------------------
        // Provider management endpoints (web-managed configuration)
        // ---------------------------------------------------------------
        //
        // GET /api/providers — catalog + non-secret runtime status (no secrets)
        if (req.method === "GET" && url.pathname === "/api/providers") {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          try {
            const statuses = await providerManager.list();
            const rc = providerManager.runtimeConfig();
            return json(res, 200, {
              version: providerManager.runtimeConfig().version,
              providers: statuses,
              activeProvider: rc.activeProvider,
              revision: rc.revision ?? 0,
              // Non-secret research-tool configuration (Tavily enablement).
              researchTools: rc.researchTools ?? {},
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // GET /api/providers/:id — status only (never returns a credential)
        const providerGet = url.pathname.match(/^\/api\/providers\/([^/]+)$/);
        if (req.method === "GET" && providerGet) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerGet[1]);
          try {
            const status = await providerManager.get(pid);
            if (!status) return json(res, 404, { error: `Unknown provider: ${pid}` });
            return json(res, 200, status);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("Unknown provider") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // PUT /api/providers/:id/credential — submit a credential (WRITE ONLY)
        // The browser may submit a credential but can never retrieve it.
        const providerCredPut = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/credential$/,
        );
        if (req.method === "PUT" && providerCredPut) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerCredPut[1]);
          const status = await providerManager.get(pid);
          if (!status)
            return json(res, 404, { error: `Unknown provider: ${pid}` });
          const entry = status; // Use status for credential check
          if (entry.credential?.type === "none")
            return json(res, 400, {
              error: "provider does not require a credential",
            });
          const credBody = await body(req);
          const value = String(credBody.value ?? credBody.apiKey ?? "");
          if (!value.trim())
            return json(res, 400, { error: "credential value is required" });
          try {
            await providerManager.setCredential(pid, {
              providerId: pid,
              credentialType: entry.credentialType as ProviderCredential["credentialType"],
              value,
              createdAt: new Date().toISOString(),
            });
            // Return ONLY a status confirmation — never the credential.
            return json(res, 200, {
              providerId: pid,
              credentialSource: "local-secret-store",
              stored: true,
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // DELETE /api/providers/:id/credential — remove a stored credential
        const providerCredDel = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/credential$/,
        );
        if (req.method === "DELETE" && providerCredDel) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerCredDel[1]);
          try {
            await providerManager.setCredential(pid);
            const refreshed = await providerManager.getProviderStatus(pid);
            return json(res, 200, {
              providerId: pid,
              configured: refreshed.configured,
              credentialSource: refreshed.credentialSource,
              deleted: true,
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("Unknown provider") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // POST /api/providers/runtime-config — update non-secret runtime config
        if (
          req.method === "POST" &&
          url.pathname === "/api/providers/runtime-config"
        ) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const rcBody = await body(req);
          try {
            const updated = providerManager.saveRuntimeConfigPatch({
              activeProvider:
                typeof rcBody.activeProvider === "string"
                  ? rcBody.activeProvider
                  : undefined,
              providers:
                rcBody.providers && typeof rcBody.providers === "object"
                  ? (rcBody.providers as Record<
                      string,
                      Partial<ProviderRuntimeSettings>
                    >)
                  : undefined,
              researchTools:
                rcBody.researchTools && typeof rcBody.researchTools === "object"
                  ? (rcBody.researchTools as ResearchToolsConfig)
                  : undefined,
            });
            return json(res, 200, { runtime: updated });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // PUT /api/providers/:id — update non-secret runtime settings (model, apiBase)
        const providerUpdate = url.pathname.match(
          /^\/api\/providers\/([^/]+)$/,
        );
        if (req.method === "PUT" && providerUpdate) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerUpdate[1]);
          const input = await body(req);
          try {
            const summary = await providerManager.update(pid, {
              model: typeof input.model === "string" ? input.model : undefined,
              apiBase:
                typeof input.apiBase === "string" ? input.apiBase : undefined,
            });
            return json(res, 200, summary);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("not found") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // POST /api/providers/:id/test — test connection (transient credential,
        // never persisted or logged)
        const providerTest = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/test$/,
        );
        if (req.method === "POST" && providerTest) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerTest[1]);
          const testBody = await body(req);
          const transient =
            typeof testBody.value === "string" ||
            typeof testBody.apiKey === "string"
              ? {
                  providerId: pid,
                  credentialType: "api_key" as const,
                  value: String(testBody.value ?? testBody.apiKey ?? ""),
                  createdAt: new Date().toISOString(),
                }
              : undefined;
          try {
            const result = await providerManager.test(pid, transient);
            return json(res, 200, result);
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("not found") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // ------------------------------------------------------------------
        // Advanced Research (Tavily) — a research TOOL, not a model provider.
        // BYOK: the key is write-only, stored server-side under the "tavily"
        // secret id, and never returned to the browser.
        // ------------------------------------------------------------------
        const tavilyCred = url.pathname.match(
          /^\/api\/research\/tavily\/credential$/,
        );
        if (
          tavilyCred &&
          (req.method === "PUT" || req.method === "DELETE") &&
          providerManager
        ) {
          try {
            if (req.method === "PUT") {
              const credBody = await body(req);
              const value =
                typeof credBody.value === "string" ? credBody.value : "";
              if (!value.trim()) {
                return json(res, 400, { error: "credential value required" });
              }
              await providerManager.setToolCredential("tavily", {
                providerId: "tavily",
                credentialType: "api_key",
                value,
                createdAt: new Date().toISOString(),
              });
            } else {
              await providerManager.setToolCredential("tavily");
            }
            return json(res, 200, {
              stored: req.method === "PUT",
              provider: "tavily",
            });
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // POST /api/research/tavily/test — Test Search with the submitted
        // TRANSIENT BYOK key (probe-only, never persisted). Performs one real
        // minimal Tavily search and normalizes the outcome.
        if (
          req.method === "POST" &&
          url.pathname === "/api/research/tavily/test" &&
          providerManager
        ) {
          try {
            const testBody = await body(req);
            const transientKey =
              typeof testBody.value === "string" ? testBody.value : "";
            const stored = await providerManager.getToolCredential("tavily");
            const apiKey = transientKey || stored?.value || "";
            if (!apiKey) {
              return json(res, 200, {
                ok: false,
                provider: "tavily",
                category: "PROVIDER_AUTH_FAILURE",
                message: "Tavily API key is not configured",
                detail: "submit a Tavily API key to test web research",
                retryable: false,
              });
            }
            const { TavilyEvidenceCollector } = await import(
              "../role/researcher/tool/tavily/evidence.js"
            );
            const collector = new TavilyEvidenceCollector(
              resolve(process.cwd()),
              undefined,
              { enabled: true, apiKey },
            );
            const evidence = await collector.collect({
              prompt_id: "prompt:tavily-connection-test",
              intent: "OneShot Tavily connection test",
              requested_outcome: "Verify the Tavily credential with one minimal search",
              context: [],
              research_direction: ["connection test"],
            });
            return json(res, 200, {
              ok: true,
              provider: "tavily",
              message: "live Tavily search probe verified",
              detail: `collected ${evidence.length} evidence item(s); credential never persisted`,
              retryable: false,
            });
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            const category = /api key|401|unauthorized|forbidden/i.test(message)
              ? "PROVIDER_AUTH_FAILURE"
              : /ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timed out|network|fetch/i.test(
                    message,
                  )
                ? "PROVIDER_NETWORK_FAILURE"
                : "PROVIDER_INTERNAL_FAILURE";
            return json(res, 200, {
              ok: false,
              provider: "tavily",
              category,
              message: "Tavily search probe failed",
              detail: message.slice(0, 300),
              retryable: category === "PROVIDER_NETWORK_FAILURE",
            });
          }
        }

        // POST /api/providers/:id/activate — set the active provider for upcoming runs
        const providerActivate = url.pathname.match(
          /^\/api\/providers\/([^/]+)\/activate$/,
        );
        if (req.method === "POST" && providerActivate) {
          if (!providerManager)
            return json(res, 503, { error: "provider management unavailable" });
          const pid = decodeURIComponent(providerActivate[1]);
          try {
            await providerManager.activate(pid);
            const provider = await providerManager.get(pid);
            return json(res, 200, { activeProvider: pid, provider });
          } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            return json(res, msg.includes("not found") ? 404 : 500, {
              error: msg,
            });
          }
        }

        // GET /api/runs/:id — run snapshot
        const runMatch = url.pathname.match(/^\/api\/runs\/([^/]+)$/);
        if (req.method === "GET" && runMatch) {
          const r = runs.get(runMatch[1]);
          return r
            ? json(res, 200, r)
            : json(res, 404, { error: "run not found" });
        }

        // GET /api/runs/:id/task — task projection
        const taskMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/task$/,
        );
        if (req.method === "GET" && taskMatch) {
          const r = runs.get(taskMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            task
              ? task.projection(taskMatch[1], r)
              : { run_id: taskMatch[1], events: events.list(taskMatch[1]) },
          );
        }

        // GET /api/runs/:id/audit — audit projection
        const auditMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/audit$/,
        );
        if (req.method === "GET" && auditMatch) {
          const r = runs.get(auditMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            task
              ? task.audit(auditMatch[1], r)
              : { run_id: auditMatch[1], events: events.list(auditMatch[1]) },
          );
        }

        // GET /api/runs/:id/adk-graph — ADK graph for a specific run
        const graphMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/adk-graph$/,
        );
        if (req.method === "GET" && graphMatch) {
          const r = runs.get(graphMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(res, 200, projectAdkGraph(events.list(graphMatch[1])));
        }

        // GET /api/runs/:id/authority-graph — authority graph for a specific run
        const authorityMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/authority-graph$/,
        );
        if (req.method === "GET" && authorityMatch) {
          const r = runs.get(authorityMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            projectAuthorityGraph(events.list(authorityMatch[1])),
          );
        }

        // GET /api/runs/:id/artifacts/:name — fetch specific artifact content
        const artifactMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/artifacts\/([^/]+)$/,
        );
        if (req.method === "GET" && artifactMatch) {
          const runId = artifactMatch[1];
          const artifactName = artifactMatch[2];
          try {
            const data = await runtime.store.load<any>(runId, artifactName);
            return json(res, 200, data);
          } catch (e) {
            return json(res, 404, {
              error: `Artifact '${artifactName}' not found for run ${runId}`,
            });
          }
        }

        // POST /api/runs/:id/sandbox/execute — execute sandbox handoff
        const sbxExecMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/sandbox\/execute$/,
        );
        if (req.method === "POST" && sbxExecMatch) {
          if (!sandbox)
            return json(res, 503, { error: "sandbox service unavailable" });
          const runId = sbxExecMatch[1];
          const r = runs.get(runId);
          if (!r) return json(res, 404, { error: "run not found" });
          if (r.result !== "PASSED" || !r.hash_proof?.equal) {
            return json(res, 409, {
              error:
                "Run has not reached confirmed DONE status with valid canonical hash",
              run_result: r.result,
            });
          }

          const inputData = await body(req);
          try {
            const confirmedPackage = await runtime.store.load<any>(
              runId,
              "confirmed",
            );
            const hash = r.hash_proof.created_hash;

            const sbxInput: SandboxExecutionInput = {
              confirmed_package: confirmedPackage,
              hash,
              execution_authorization: inputData.execution_authorization as any,
            };

            const result = await sandbox.execute(sbxInput);
            return json(res, result.result === "PASSED" ? 200 : 409, result);
          } catch (e) {
            return json(res, 500, {
              error: e instanceof Error ? e.message : String(e),
            });
          }
        }

        // GET /api/runs/:id/sandbox — get recorded sandbox evidence
        const sbxGetMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/sandbox$/,
        );
        if (req.method === "GET" && sbxGetMatch) {
          if (!sandbox)
            return json(res, 503, { error: "sandbox service unavailable" });
          const evidence = sandbox.getEvidence(sbxGetMatch[1]);
          return evidence
            ? json(res, 200, evidence)
            : json(res, 404, {
                error: "sandbox evidence not found for run",
              });
        }

        // GET /api/runs/:id/sandbox-graph — sandbox lifecycle graph for run
        const sbxGraphMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/sandbox-graph$/,
        );
        if (req.method === "GET" && sbxGraphMatch) {
          const r = runs.get(sbxGraphMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            projectSandboxGraph(events.list(sbxGraphMatch[1])),
          );
        }

        // GET /api/runs/:id/events — SSE event stream
        const eventMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/events$/,
        );
        if (req.method === "GET" && eventMatch) {
          const runId = eventMatch[1];
          const snapshot = runs.get(runId);
          if (!snapshot) return json(res, 404, { error: "run not found" });

          res.writeHead(200, {
            "content-type": "text/event-stream",
            "cache-control": "no-cache",
            connection: "keep-alive",
            "x-content-type-options": "nosniff",
          });

          // SSE wire format: `id: <sequence>` + `event: processing` + `data:{...}`.
          // The id lets a reconnecting client send Last-Event-ID so we replay only
          // events after that sequence (no duplicate replay). The frontend keys
          // on event_id so it tolerates repeated events regardless.
          const sendEvent = (e: { sequence: number }) => {
            res.write(`id: ${e.sequence}\n`);
            res.write(`event: processing\n`);
            res.write(`data: ${JSON.stringify(e)}\n\n`);
          };

          const lastHeader = req.headers["last-event-id"];
          const lastSeq =
            typeof lastHeader === "string" ? Number(lastHeader) : NaN;
          const replayFrom = Number.isFinite(lastSeq) ? lastSeq : -1;
          for (const e of snapshot.events) {
            if (e.sequence > replayFrom) sendEvent(e);
          }

          // Subscribe to live canonical events. Closing the browser only
          // unsubscribes here — it NEVER cancels the BullMQ job/run.
          const unsub = events.subscribe(runId, sendEvent);
          const heartbeat = setInterval(() => {
            try {
              res.write(`: keep-alive\n\n`);
            } catch {
              /* connection already closed */
            }
          }, 15_000);
          req.on("close", () => {
            unsub();
            clearInterval(heartbeat);
          });
          return;
        }

        // ---------------------------------------------------------------
        // Static UI files
        // ---------------------------------------------------------------
        if (req.method === "GET") {
          const requested =
            url.pathname === "/" ? "index.html" : url.pathname.slice(1);
          const safe = normalize(requested).replace(
            /^(\.\.(\/|\\|$))+/,
            "",
          );
          const firstSegment = safe.split(/[\\/]/)[0] ?? "";
          if (
            firstSegment.startsWith(".") ||
            isSensitiveWorkspacePath(safe)
          ) {
            // Deny HTTP reads of .env / .env.* / .git / .runtime / credential
            // and secret files. Never reveal whether the path exists.
            return json(res, 404, { error: "not found" });
          }
          const p = join(uiRoot, safe);
          try {
            const data = await readFile(p);
            res.writeHead(200, {
              "content-type": mime(p),
              "cache-control": "no-store",
            });
            return res.end(data);
          } catch {
            const acceptsHtml = (req.headers.accept || "").includes("text/html");
            if (url.pathname !== "/" && acceptsHtml) {
              try {
                const index = await readFile(join(uiRoot, "index.html"));
                res.writeHead(200, {
                  "content-type": "text/html; charset=utf-8",
                  "cache-control": "no-store",
                });
                return res.end(index);
              } catch {
                /* fall through to 404 */
              }
            }
          }
        }

        json(res, 404, { error: "not found" });
      } catch (e) {
        json(res, 500, {
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
  );

  return new Promise<ReturnType<typeof createServer>>((resolveServer) =>
    server.listen(port, bindHost, () => resolveServer(server)),
  );
}
