/**
 * HTTP handlers for conversation-scoped skill activation.
 */
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "./http-response.js";
import type { SkillActivationGate, SkillGroup, SkillRuntimeBinding } from "../skills/types.js";

export interface SkillHandlerContext {
  gate: SkillActivationGate;
  registry: Map<string, SkillRuntimeBinding>;
}

function parseBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString("utf8");
    });
    req.on("end", () => {
      try {
        resolve(body ? (JSON.parse(body) as Record<string, unknown>) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

export async function handleSkillRoutes(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  ctx: SkillHandlerContext,
): Promise<boolean> {
  const conversationId = url.searchParams.get("conversationId") || undefined;

  // GET /api/skills — list all skills and their availability/activation state.
  if (req.method === "GET" && url.pathname === "/api/skills") {
    if (!conversationId) {
      return json(res, 400, { error: "conversationId required" }), true;
    }
    const active = await Promise.all(
      Array.from(ctx.registry.values()).map(async (binding) => {
        const isActive = await ctx.gate.isActive(binding.descriptor, conversationId);
        return {
          id: binding.descriptor.skill_id,
          name: binding.descriptor.name,
          description: binding.descriptor.responsibilities.join("; "),
          available: binding.available,
          defaultGroups: binding.descriptor.groups ?? [],
          activeGroups: isActive
            ? ((await ctx.gate.requireActive(binding.descriptor, conversationId)).groups as string[])
            : [],
        };
      }),
    );
    return json(res, 200, { skills: active }), true;
  }

  // GET /api/skills/:id — activation state for a single skill.
  const getMatch = url.pathname.match(/^\/api\/skills\/([^/]+)$/);
  if (req.method === "GET" && getMatch && conversationId) {
    const skillId = decodeURIComponent(getMatch[1]);
    const binding = ctx.registry.get(skillId);
    if (!binding) return json(res, 404, { error: "skill not found" }), true;
    const active = await ctx.gate.isActive(binding.descriptor, conversationId);
    if (!active) return json(res, 204, {}), true;
    const state = await ctx.gate.requireActive(binding.descriptor, conversationId);
    return json(res, 200, { skillId: state.skill_id, groups: state.groups }), true;
  }

  // POST /api/skills/:id/activate
  const activateMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/activate$/);
  if (req.method === "POST" && activateMatch) {
    const skillId = decodeURIComponent(activateMatch[1]);
    const binding = ctx.registry.get(skillId);
    if (!binding) return json(res, 404, { error: "skill not found" }), true;
    const body = await parseBody(req);
    const convId = (body.conversationId as string) || conversationId;
    const groups = body.groups as string[];
    if (!convId) return json(res, 400, { error: "conversationId required" }), true;
    if (!Array.isArray(groups) || groups.length === 0) {
      return json(res, 400, { error: "groups array required" }), true;
    }
    try {
      const state = await ctx.gate.activate(
        binding.descriptor,
        convId,
        (body.runId as string) || undefined,
        groups as SkillGroup[],
        "user",
      );
      return json(res, 200, { skillId: state.skill_id, groups: state.groups }), true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json(res, 400, { error: message }), true;
    }
  }

  // POST /api/skills/:id/deactivate
  const deactivateMatch = url.pathname.match(/^\/api\/skills\/([^/]+)\/deactivate$/);
  if (req.method === "POST" && deactivateMatch) {
    const skillId = decodeURIComponent(deactivateMatch[1]);
    const binding = ctx.registry.get(skillId);
    if (!binding) return json(res, 404, { error: "skill not found" }), true;
    const body = await parseBody(req);
    const convId = (body.conversationId as string) || conversationId;
    if (!convId) return json(res, 400, { error: "conversationId required" }), true;
    await ctx.gate.deactivate(binding.descriptor, convId);
    return json(res, 200, { deactivated: skillId }), true;
  }

  return false;
}
