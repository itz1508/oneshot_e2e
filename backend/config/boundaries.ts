/**
 * OneShot Configuration Boundaries
 *
 * Explicit rules for what configuration propagates across boundaries
 * and what remains isolated. Prevents configuration leakage and enforces
 * proper encapsulation.
 *
 * Pattern: Extracted from Pydantic architecture configuration boundary rules
 */

/**
 * Configuration scope levels
 */
export enum ConfigScope {
  Session = 'session',
  Workflow = 'workflow',
  Validation = 'validation',
  Builder = 'builder',
  Persistence = 'persistence',
  Research = 'research',
}

/**
 * Configuration that may propagate through boundaries
 */
export interface PropagatingConfig {
  // Serialization settings
  serializationMode?: 'json' | 'binary' | 'hybrid';
  timestampFormat?: 'iso8601' | 'unix' | 'millis';
  
  // Encoding
  encoding?: 'utf8' | 'base64' | 'hex';
  
  // String processing
  stringProcessing?: {
    toLowerCase?: boolean;
    stripWhitespace?: boolean;
    maxLength?: number;
  };
}

/**
 * Configuration that NEVER propagates (isolated per scope)
 */
export interface IsolatedConfig {
  // Session-level isolation
  sessionTimeout?: number;
  sessionMaxSize?: number;
  sessionReadOnly?: boolean;

  // Workflow-level isolation
  workflowTimeout?: number;
  maxRetries?: number;
  retryBackoff?: number;

  // Validation-level isolation
  strictMode?: boolean;
  validateDefaults?: boolean;
  coerceValues?: boolean;

  // Builder-level isolation
  buildTimeout?: number;
  cacheEnabled?: boolean;

  // Persistence-level isolation
  storageBackend?: string;
  compressionEnabled?: boolean;

  // Research-level isolation
  maxRefinementCycles?: number;
  qualityThreshold?: number;
  fragmentationStrategy?: 'sequential' | 'parallel' | 'adaptive';
}

/**
 * Configuration boundary definition
 */
export interface ConfigBoundary {
  scope: ConfigScope;
  propagatesTo: ConfigScope[];
  propagatingFields: (keyof PropagatingConfig)[];
  isolatedFields: (keyof IsolatedConfig)[];
  parent?: ConfigScope;
}

/**
 * Boundary rules - what propagates where
 */
export const BOUNDARY_RULES: Record<ConfigScope, ConfigBoundary> = {
  [ConfigScope.Session]: {
    scope: ConfigScope.Session,
    propagatesTo: [ConfigScope.Workflow],
    propagatingFields: ['serializationMode', 'encoding'],
    isolatedFields: ['sessionTimeout', 'sessionMaxSize', 'sessionReadOnly'],
  },

  [ConfigScope.Workflow]: {
    scope: ConfigScope.Workflow,
    propagatesTo: [ConfigScope.Validation, ConfigScope.Builder],
    propagatingFields: ['serializationMode', 'encoding'],
    isolatedFields: ['workflowTimeout', 'maxRetries', 'retryBackoff'],
    parent: ConfigScope.Session,
  },

  [ConfigScope.Validation]: {
    scope: ConfigScope.Validation,
    propagatesTo: [], // Validation does NOT propagate down
    propagatingFields: [],
    isolatedFields: ['strictMode', 'validateDefaults', 'coerceValues'],
    parent: ConfigScope.Workflow,
  },

  [ConfigScope.Builder]: {
    scope: ConfigScope.Builder,
    propagatesTo: [ConfigScope.Persistence],
    propagatingFields: ['serializationMode', 'encoding'],
    isolatedFields: ['buildTimeout', 'cacheEnabled'],
    parent: ConfigScope.Workflow,
  },

  [ConfigScope.Persistence]: {
    scope: ConfigScope.Persistence,
    propagatesTo: [], // Persistence is terminal
    propagatingFields: [],
    isolatedFields: ['storageBackend', 'compressionEnabled'],
    parent: ConfigScope.Builder,
  },

  [ConfigScope.Research]: {
    scope: ConfigScope.Research,
    propagatesTo: [], // Research is independent
    propagatingFields: [],
    isolatedFields: ['maxRefinementCycles', 'qualityThreshold', 'fragmentationStrategy'],
  },
};

/**
 * Check if configuration can propagate from source to target scope
 */
export function canPropagate(from: ConfigScope, to: ConfigScope): boolean {
  const boundary = BOUNDARY_RULES[from];
  return boundary.propagatesTo.includes(to);
}

/**
 * Get fields that can propagate from source to target
 */
export function getPropagatingFields(
  from: ConfigScope,
  to: ConfigScope
): (keyof PropagatingConfig)[] {
  if (!canPropagate(from, to)) {
    return [];
  }
  return BOUNDARY_RULES[from].propagatingFields;
}

/**
 * Verify configuration respects boundaries
 */
export interface BoundaryViolation {
  field: string;
  fromScope: ConfigScope;
  toScope: ConfigScope;
  reason: string;
}

/**
 * Track configuration application for auditability
 */
export interface ConfigAuditEntry {
  timestamp: number;
  scope: ConfigScope;
  field: string;
  value: unknown;
  source: 'propagation' | 'direct' | 'override';
  overrideJustification?: string;
}

/**
 * Configuration audit trail
 */
export class ConfigAuditTrail {
  private entries: ConfigAuditEntry[] = [];

  record(
    scope: ConfigScope,
    field: string,
    value: unknown,
    source: 'propagation' | 'direct' | 'override',
    justification?: string
  ): void {
    this.entries.push({
      timestamp: Date.now(),
      scope,
      field,
      value,
      source,
      overrideJustification: justification,
    });
  }

  getEntries(scope?: ConfigScope): ConfigAuditEntry[] {
    if (!scope) {
      return [...this.entries];
    }
    return this.entries.filter((e) => e.scope === scope);
  }

  getChain(scope: ConfigScope, field: string): ConfigAuditEntry[] {
    return this.entries.filter((e) => e.scope === scope && e.field === field);
  }

  clear(): void {
    this.entries = [];
  }
}

export function validateBoundaries(
  config: Record<string, unknown>,
  from: ConfigScope,
  to: ConfigScope
): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];

  if (!canPropagate(from, to)) {
    for (const key of Object.keys(config)) {
      violations.push({
        field: key,
        fromScope: from,
        toScope: to,
        reason: `${from} cannot propagate to ${to}`,
      });
    }
    return violations;
  }

  const allowedFields = getPropagatingFields(from, to);
  for (const key of Object.keys(config)) {
    if (!allowedFields.includes(key as keyof PropagatingConfig)) {
      violations.push({
        field: key,
        fromScope: from,
        toScope: to,
        reason: `Field '${key}' is not allowed to propagate from ${from}`,
      });
    }
  }

  return violations;
}

/**
 * Override boundary rules with justification
 * Use sparingly and always log the reason
 */
export interface BoundaryOverride {
  field: string;
  fromScope: ConfigScope;
  toScope: ConfigScope;
  justification: string;
  timestamp: number;
}

/**
 * Manager for boundary overrides
 */
export class BoundaryOverrideRegistry {
  private overrides: BoundaryOverride[] = [];

  allow(
    field: string,
    from: ConfigScope,
    to: ConfigScope,
    justification: string
  ): void {
    if (!justification || justification.trim().length === 0) {
      throw new Error('BoundaryOverride requires a justification');
    }

    this.overrides.push({
      field,
      fromScope: from,
      toScope: to,
      justification,
      timestamp: Date.now(),
    });
  }

  isOverridden(field: string, from: ConfigScope, to: ConfigScope): boolean {
    return this.overrides.some(
      (o) => o.field === field && o.fromScope === from && o.toScope === to
    );
  }

  getOverride(field: string, from: ConfigScope, to: ConfigScope): BoundaryOverride | undefined {
    return this.overrides.find(
      (o) => o.field === field && o.fromScope === from && o.toScope === to
    );
  }

  getAllOverrides(): BoundaryOverride[] {
    return [...this.overrides];
  }

  clear(): void {
    this.overrides = [];
  }
}
