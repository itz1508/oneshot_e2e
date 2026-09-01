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
import type { Prompt } from "../contract/types.js";
import { id, newRunId } from "../core/id.js";
import { RunRepository } from "../runtime/run-repository.js";
import { ProcessingEventBus } from "../runtime/event-bus.js";
import { WorkflowRuntime } from "../runtime/workflow-runtime.js";
import type { TaskManagement } from "../task/task-management.js";
import { projectAdkGraph } from "../graph/adk-graph.js";
import { projectAuthorityGraph } from "../graph/authority-graph.js";
import { projectIntentGraph } from "../graph/intent-graph.js";
import { projectWorkflowGraph } from "../graph/workflow-graph.js";
import type { IntentCollectionService } from "../intent/intent-collection.js";
import type { SandboxService } from "../sandbox/sandbox-service.js";
import { projectSandboxGraph } from "../sandbox/graph/sandbox-graph.js";
import type { SandboxExecutionInput } from "../sandbox/types.js";
import { resolveRuntimePaths } from "../runtime-paths.js";
import { HttpSecurity } from "./http-security.js";
import {
  WorkspacePathDeniedError,
  WorkspacePathPolicy,
  WorkspacePathTraversalError,
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
  ".pdf": "application/pdf",
  ".txt": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};
const mime = (p: string) => MIME[extname(p).toLowerCase()] || "application/octet-stream";

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
    options.workspaceRoot || resolveRuntimePaths().workspaceRoot,
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
          req.method === "GET" &&
          (url.pathname === "/v1/workspace/raw" ||
            url.pathname === "/api/workspace/raw")
        ) {
          const reqPath = url.searchParams.get("path") || "";
          if (!reqPath) return json(res, 400, { error: "path parameter required" });
          try {
            const targetFile = await workspacePolicy.authorizeExisting(reqPath);
            const data = await readFile(targetFile);
            const contentType = mime(targetFile);
            res.writeHead(200, {
              "content-type": contentType,
              "content-disposition": "inline",
              "cache-control": "no-store",
            });
            return res.end(data);
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
          return json(res, 200, {
            status: "ok",
            workflow: "oneshot-canonical-workflow",
            mode: runtimeInfo?.mode || process.env.ONESHOT_MODE || "sample",
            provider: runtimeInfo?.provider || "unknown",
            task_management: Boolean(task),
            intent_collection: Boolean(intent),
            sandbox_service: Boolean(sandbox),
            adk_graph: "oneshot-adk-researcher-v1",
            authority_graph: "oneshot-authority-trace-v1",
                        sandbox_graph: "oneshot-sandbox-execution-v1",
          });
        }

        // ---------------------------------------------------------------
        // Browser session authentication (cookie + CSRF layered on Bearer auth)
        // ---------------------------------------------------------------
        // POST /auth/login — exchange the operator token for a session cookie
        //   + CSRF token. When auth is disabled (no ONESHOT_API_TOKEN) a session
        //   is still issued so the IDE loads without a login wall.
        if (req.method === "POST" && url.pathname === "/auth/login") {
          if (!security.authDisabled) {
            const input = await body(req);
            const candidate = String(input.token || "");
            if (!security.tokenMatches(candidate)) {
              return json(res, 401, { error: "invalid token" });
            }
          }
          const session = security.createSession();
          security.applySessionCookie(res, session);
          return json(res, 200, {
            ok: true,
            csrf_token: session.csrfToken,
            expires_at: new Date(session.expiresAt).toISOString(),
          });
        }

        // GET /auth/session — session status + CSRF token, or 401.
        if (req.method === "GET" && url.pathname === "/auth/session") {
          const session = security.sessionFromRequest(req);
          if (!session && security.authDisabled) {
            const anon = security.createSession();
            security.applySessionCookie(res, anon);
            return json(res, 200, {
              ok: true,
              csrf_token: anon.csrfToken,
              expires_at: new Date(anon.expiresAt).toISOString(),
            });
          }
          if (!session) {
            return json(res, 401, { error: "no active session" });
          }
          return json(res, 200, {
            ok: true,
            csrf_token: session.csrfToken,
            expires_at: new Date(session.expiresAt).toISOString(),
          });
        }

        // POST /auth/logout — revoke session and clear cookie.
        // Low-impact (session teardown only): CSRF-exempt by design, but the
        // session cookie is sent so the correct session is revoked.
        if (req.method === "POST" && url.pathname === "/auth/logout") {
          security.revokeSession(req);
          security.clearSessionCookie(res);
          return json(res, 200, { ok: true });
        }

        // ---------------------------------------------------------------
        // Static graphs (no run context)
        // ---------------------------------------------------------------
        if (req.method === "GET" && url.pathname === "/api/graphs/adk") {
          return json(res, 200, projectAdkGraph());
        }
        if (req.method === "GET" && (url.pathname === "/api/graphs/workflow" || url.pathname === "/api/graphs/adk-workflow")) {
          return json(res, 200, projectWorkflowGraph());
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

          void runtime.run(runId, prompt);
          return json(res, 202, { run_id: runId });
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

        // GET /api/runs/:id/workflow-graph — ADK 2.0 workflow graph for a specific run
        const workflowGraphMatch = url.pathname.match(
          /^\/api\/runs\/([^/]+)\/(?:workflow-graph|adk-workflow-graph)$/,
        );
        if (req.method === "GET" && workflowGraphMatch) {
          const r = runs.get(workflowGraphMatch[1]);
          if (!r) return json(res, 404, { error: "run not found" });
          return json(
            res,
            200,
            projectWorkflowGraph(events.list(workflowGraphMatch[1])),
          );
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
          });

          // Replay existing events
          for (const e of snapshot.events) {
            res.write(`data: ${JSON.stringify(e)}\n\n`);
          }

          // Subscribe to new events
          const unsub = events.subscribe(runId, (e) =>
            res.write(`data: ${JSON.stringify(e)}\n\n`),
          );
          req.on("close", unsub);
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
