import type { SkillCatalog } from "./catalog.js";
import type {
  SkillDescriptor,
  SkillResolutionQuery,
  SkillResolutionResult,
} from "./types.js";

/**
 * Exact Capability Resolver.
 *
 * Rules:
 * 1. Strict exact matching ONLY.
 * 2. Never silently substitute a similar Skill.
 * 3. Governed `resolveOrCreate` pathway for explicit dynamic capability registration.
 */
export class SkillResolver {
  constructor(private catalog: SkillCatalog) {}

  /**
   * Resolve a capability or skill by exact identity, capability name, or tool name.
   * Enforces zero fuzzy substitution.
   */
  resolveExact(query: SkillResolutionQuery): SkillResolutionResult {
    if (!query || (!query.skill_id && !query.capability && !query.tool)) {
      return {
        resolved: false,
        reason: "Invalid resolution query: must provide skill_id, capability, or tool",
      };
    }

    // 1. Exact skill_id lookup
    if (query.skill_id) {
      if (this.catalog.has(query.skill_id)) {
        const descriptor = this.catalog.get(query.skill_id);
        return {
          resolved: true,
          skill_id: descriptor.skill_id,
          descriptor,
        };
      }
      return {
        resolved: false,
        reason: `No exact Skill matching skill_id '${query.skill_id}'`,
      };
    }

    // 2. Exact capability lookup
    if (query.capability) {
      const matches = this.catalog.findByCapability(query.capability);
      if (matches.length > 0) {
        return {
          resolved: true,
          skill_id: matches[0].skill_id,
          descriptor: matches[0],
        };
      }
      return {
        resolved: false,
        reason: `No exact Skill matching capability '${query.capability}'`,
      };
    }

    // 3. Exact tool name lookup
    if (query.tool) {
      const match = this.catalog.findByTool(query.tool);
      if (match) {
        return {
          resolved: true,
          skill_id: match.skill_id,
          descriptor: match,
        };
      }
      return {
        resolved: false,
        reason: `No exact Skill exposing tool '${query.tool}'`,
      };
    }

    return {
      resolved: false,
      reason: "No exact match found",
    };
  }

  /**
   * Governed capability creation and resolution pathway.
   * If exact match is missing, uses the provided creator to register and resolve.
   */
  resolveOrCreate(
    capability: string,
    creator: (cap: string) => SkillDescriptor,
  ): SkillResolutionResult {
    const existing = this.resolveExact({ capability });
    if (existing.resolved) {
      return existing;
    }

    const created = creator(capability);
    this.catalog.register(created);

    return {
      resolved: true,
      skill_id: created.skill_id,
      descriptor: created,
    };
  }
}
