import { body, json } from "../http-response.js";
import type { IntentCollectionService } from "../../intent/intent-collection.js";
import type { IncomingMessage, ServerResponse } from "node:http";

export async function handleConversationMemoryRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  intent: IntentCollectionService | undefined,
): Promise<boolean> {
  if (!intent) return false;

  // GET /api/conversations — list sessions
  if (req.method === "GET" && url.pathname === "/api/conversations") {
    const list = intent.listConversations();
    return json(res, 200, { conversations: list }), true;
  }

  // GET /api/conversations/:id — full snapshot including memory
  const getConv = url.pathname.match(/^\/api\/conversations\/([^/]+)$/);
  if (req.method === "GET" && getConv) {
    const cid = decodeURIComponent(getConv[1]);
    const snap = intent.get(cid);
    if (!snap) return json(res, 404, { error: "conversation not found" }), true;
    return json(res, 200, snap), true;
  }

  // POST /api/conversations/:id/memory/fixed-intent — toggle fixed intent
  const fixedIntentMatch = url.pathname.match(
    /^\/api\/conversations\/([^/]+)\/memory\/fixed-intent$/,
  );
  if (req.method === "POST" && fixedIntentMatch) {
    const cid = decodeURIComponent(fixedIntentMatch[1]);
    const input = (await body(req)) as { enabled?: unknown };
    const enabled = input.enabled === true || input.enabled === "true";
    try {
      const snap = intent.setFixedIntent(cid, enabled);
      return json(res, 200, snap), true;
    } catch (e) {
      return (
        json(res, 404, {
          error: e instanceof Error ? e.message : String(e),
        }),
        true
      );
    }
  }

  return false;
}
