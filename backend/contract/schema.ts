/**
 * OneShot Contract Schemas
 *
 * Defines contract boundaries between components via JSON Schema,
 * and links contracts to manifest entries for verification.
 *
 * Pattern: Extracted from Pydantic architecture contract → manifest binding
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../validation/failure-taxonomy.js';

/**
 * JSON Schema representation
 * Simplified subset of JSON Schema Draft 7
 */
export interface JsonSchema {
  $schema?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  oneOf?: JsonSchema[];
  allOf?: JsonSchema[];
  anyOf?: JsonSchema[];
  not?: JsonSchema;
  [key: string]: unknown;
}

/**
 * Contract definition for a component
 */
export interface ContractSchema {
  id: string;
  name: string;
  version: string;
  description?: string;
  input: JsonSchema;
  output: JsonSchema;
  examples?: {
    input: unknown;
    output: unknown;
  }[];
  deprecated?: boolean;
}

/**
 * Link between contract and manifest entry
 */
export interface ManifestLink {
  contractId: string;
  artifactPath: string;
  artifactHash: string;
  lastVerified: number;
  verified: boolean;
}

/**
 * Contract validation result
 */
export interface ContractValidationResult {
  contractId: string;
  valid: boolean;
  inputValid: boolean;
  outputValid: boolean;
  violations: ContractViolation[];
}

/**
 * Contract violation
 */
export interface ContractViolation {
  path: string[];
  schema: string;
  received: unknown;
  message: string;
}

/**
 * Schema validator
 */
export class SchemaValidator {
  /**
   * Validate a value against a schema
   */
  static validate(value: unknown, schema: JsonSchema): ContractViolation[] {
    const violations: ContractViolation[] = [];
    this.validateRecursive(value, schema, [], violations);
    return violations;
  }

  private static validateRecursive(
    value: unknown,
    schema: JsonSchema,
    path: string[],
    violations: ContractViolation[]
  ): void {
    // Type validation
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (!types.includes(actualType)) {
        violations.push({
          path,
          schema: `type: ${types.join('|')}`,
          received: actualType,
          message: `Expected type ${types.join(' or ')}, got ${actualType}`,
        });
        return; // Stop validation if type is wrong
      }
    }

    // Enum validation
    if (schema.enum && !schema.enum.includes(value)) {
      violations.push({
        path,
        schema: `enum: ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`,
        received: value,
        message: `Value must be one of: ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`,
      });
    }

    // Const validation
    if (schema.const !== undefined && value !== schema.const) {
      violations.push({
        path,
        schema: `const: ${JSON.stringify(schema.const)}`,
        received: value,
        message: `Value must be exactly ${JSON.stringify(schema.const)}`,
      });
    }

    // String validations
    if (typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        violations.push({
          path,
          schema: `minLength: ${schema.minLength}`,
          received: value.length,
          message: `String length ${value.length} is less than minimum ${schema.minLength}`,
        });
      }

      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        violations.push({
          path,
          schema: `maxLength: ${schema.maxLength}`,
          received: value.length,
          message: `String length ${value.length} exceeds maximum ${schema.maxLength}`,
        });
      }

      if (schema.pattern) {
        try {
          const regex = new RegExp(schema.pattern);
          if (!regex.test(value)) {
            violations.push({
              path,
              schema: `pattern: ${schema.pattern}`,
              received: value,
              message: `String does not match pattern ${schema.pattern}`,
            });
          }
        } catch (error) {
          // Invalid regex pattern
          violations.push({
            path,
            schema: `pattern: ${schema.pattern}`,
            received: 'invalid-regex',
            message: `Invalid regex pattern: ${schema.pattern}`,
          });
        }
      }
    }

    // Number validations
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        violations.push({
          path,
          schema: `minimum: ${schema.minimum}`,
          received: value,
          message: `Number ${value} is less than minimum ${schema.minimum}`,
        });
      }

      if (schema.maximum !== undefined && value > schema.maximum) {
        violations.push({
          path,
          schema: `maximum: ${schema.maximum}`,
          received: value,
          message: `Number ${value} exceeds maximum ${schema.maximum}`,
        });
      }
    }

    // Object validations
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;

      // Required properties
      if (schema.required) {
        for (const required of schema.required) {
          if (!(required in obj)) {
            violations.push({
              path: [...path, required],
              schema: 'required',
              received: undefined,
              message: `Required property '${required}' is missing`,
            });
          }
        }
      }

      // Property validation
      if (schema.properties) {
        for (const [prop, propSchema] of Object.entries(schema.properties)) {
          if (prop in obj) {
            this.validateRecursive(obj[prop], propSchema, [...path, prop], violations);
          }
        }
      }

      // Additional properties
      if (schema.properties && schema.additionalProperties === false) {
        for (const prop of Object.keys(obj)) {
          if (!(prop in schema.properties)) {
            violations.push({
              path: [...path, prop],
              schema: 'additionalProperties: false',
              received: obj[prop],
              message: `Unexpected property '${prop}'`,
            });
          }
        }
      }
    }

    // Array validations
    if (Array.isArray(value)) {
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          this.validateRecursive(value[i], schema.items, [...path, `[${i}]`], violations);
        }
      }
    }
  }
}

/**
 * Contract registry
 */
export class ContractRegistry {
  private contracts: Map<string, ContractSchema> = new Map();
  private manifests: Map<string, ManifestLink[]> = new Map(); // contractId -> manifests

  /**
   * Register a contract
   */
  register(contract: ContractSchema): void {
    if (this.contracts.has(contract.id)) {
      throw new Error(`Contract '${contract.id}' already registered`);
    }
    this.contracts.set(contract.id, contract);
    this.manifests.set(contract.id, []);
  }

  /**
   * Get a contract by ID
   */
  getContract(id: string): ContractSchema | undefined {
    return this.contracts.get(id);
  }

  /**
   * Get all contracts
   */
  getAllContracts(): ContractSchema[] {
    return Array.from(this.contracts.values());
  }

  /**
   * Link a contract to a manifest entry
   */
  linkToManifest(contractId: string, manifestLink: ManifestLink): void {
    if (!this.contracts.has(contractId)) {
      throw new Error(`Contract '${contractId}' not registered`);
    }

    const manifests = this.manifests.get(contractId)!;
    manifests.push(manifestLink);
  }

  /**
   * Get manifest links for a contract
   */
  getManifestLinks(contractId: string): ManifestLink[] {
    return this.manifests.get(contractId) || [];
  }

  /**
   * Validate a contract's input
   */
  validateInput(contractId: string, input: unknown): ValidationResult<unknown> {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      return validationError({
        type: FailureType.ContractMismatch,
        severity: FailureSeverity.Error,
        message: `Contract '${contractId}' not found`,
        timestamp: Date.now(),
      });
    }

    const violations = SchemaValidator.validate(input, contract.input);

    if (violations.length > 0) {
      const failures = violations.map((v) => ({
        type: FailureType.ContractMismatch,
        severity: FailureSeverity.Error,
        message: v.message,
        path: v.path,
        context: { schema: v.schema, received: v.received },
        timestamp: Date.now(),
      }));

      return validationError(...failures);
    }

    return validationSuccess(input);
  }

  /**
   * Validate a contract's output
   */
  validateOutput(contractId: string, output: unknown): ValidationResult<unknown> {
    const contract = this.contracts.get(contractId);
    if (!contract) {
      return validationError({
        type: FailureType.ContractMismatch,
        severity: FailureSeverity.Error,
        message: `Contract '${contractId}' not found`,
        timestamp: Date.now(),
      });
    }

    const violations = SchemaValidator.validate(output, contract.output);

    if (violations.length > 0) {
      const failures = violations.map((v) => ({
        type: FailureType.ContractMismatch,
        severity: FailureSeverity.Error,
        message: v.message,
        path: v.path,
        context: { schema: v.schema, received: v.received },
        timestamp: Date.now(),
      }));

      return validationError(...failures);
    }

    return validationSuccess(output);
  }

  /**
   * Clear all contracts
   */
  clear(): void {
    this.contracts.clear();
    this.manifests.clear();
  }

  /**
   * Get contract count
   */
  count(): number {
    return this.contracts.size;
  }
}
