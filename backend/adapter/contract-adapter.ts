/**
 * OneShot Contract Adapter Pattern
 *
 * Adapts between different contract formats, versions, and representations.
 * Enables backward compatibility and format transformation.
 *
 * Pattern: Extracted from Pydantic architecture adapter pattern
 */

import { JsonSchema } from '../contract/schema.js';
import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../validation/failure-taxonomy.js';

/**
 * Contract format types
 */
export enum ContractFormat {
  JsonSchema = 'json-schema',
  OpenAPI = 'openapi',
  GraphQL = 'graphql',
  Protobuf = 'protobuf',
}

/**
 * Contract representation
 */
export interface ContractRepresentation {
  format: ContractFormat;
  version: string;
  content: Record<string, unknown>;
}

/**
 * Adapter interface
 */
export interface ContractAdapter {
  sourceFormat: ContractFormat;
  targetFormat: ContractFormat;
  canAdapt(source: ContractRepresentation): boolean;
  adapt(source: ContractRepresentation): ValidationResult<ContractRepresentation>;
}

/**
 * JSON Schema ↔ OpenAPI adapter
 */
export class JsonSchemaToOpenAPIAdapter implements ContractAdapter {
  sourceFormat = ContractFormat.JsonSchema;
  targetFormat = ContractFormat.OpenAPI;

  canAdapt(source: ContractRepresentation): boolean {
    return source.format === ContractFormat.JsonSchema;
  }

  adapt(source: ContractRepresentation): ValidationResult<ContractRepresentation> {
    try {
      const schema = source.content as JsonSchema;
      const openapi: Record<string, unknown> = {
        openapi: '3.1.0',
        info: {
          title: schema.title || 'API',
          version: '1.0.0',
          description: schema.description,
        },
        paths: {},
        components: {
          schemas: {
            Response: this.convertSchema(schema),
          },
        },
      };

      return validationSuccess({
        format: ContractFormat.OpenAPI,
        version: '3.1.0',
        content: openapi,
      });
    } catch (error) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `Failed to convert JSON Schema to OpenAPI: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  private convertSchema(schema: JsonSchema): Record<string, unknown> {
    return {
      type: schema.type || 'object',
      title: schema.title,
      description: schema.description,
      properties: schema.properties,
      required: schema.required,
      additionalProperties: schema.additionalProperties,
    };
  }
}

/**
 * OpenAPI → JSON Schema adapter
 */
export class OpenAPIToJsonSchemaAdapter implements ContractAdapter {
  sourceFormat = ContractFormat.OpenAPI;
  targetFormat = ContractFormat.JsonSchema;

  canAdapt(source: ContractRepresentation): boolean {
    return source.format === ContractFormat.OpenAPI;
  }

  adapt(source: ContractRepresentation): ValidationResult<ContractRepresentation> {
    try {
      const openapi = source.content as Record<string, unknown>;
      const components = (openapi.components as Record<string, Record<string, unknown>>) || {};
      const schemas = components.schemas || {};

      // Take first schema as representative
      const firstSchema = Object.values(schemas)[0] as JsonSchema;

      const jsonSchema: JsonSchema = {
        $schema: 'https://json-schema.org/draft-07/schema#',
        title: (openapi.info as Record<string, unknown>)?.title as string | undefined,
        description: (openapi.info as Record<string, unknown>)?.description as string | undefined,
        ...firstSchema,
      };

      return validationSuccess({
        format: ContractFormat.JsonSchema,
        version: '7',
        content: jsonSchema,
      });
    } catch (error) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `Failed to convert OpenAPI to JSON Schema: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Contract adapter registry
 */
export class ContractAdapterRegistry {
  private adapters: Map<string, ContractAdapter> = new Map();

  /**
   * Register an adapter
   */
  register(adapter: ContractAdapter): void {
    const key = `${adapter.sourceFormat}→${adapter.targetFormat}`;
    this.adapters.set(key, adapter);
  }

  /**
   * Get adapter for conversion
   */
  getAdapter(from: ContractFormat, to: ContractFormat): ContractAdapter | undefined {
    const key = `${from}→${to}`;
    return this.adapters.get(key);
  }

  /**
   * Check if conversion is possible
   */
  canConvert(from: ContractFormat, to: ContractFormat): boolean {
    return this.getAdapter(from, to) !== undefined;
  }

  /**
   * Convert between formats
   */
  convert(
    source: ContractRepresentation,
    targetFormat: ContractFormat
  ): ValidationResult<ContractRepresentation> {
    if (source.format === targetFormat) {
      return validationSuccess(source);
    }

    const adapter = this.getAdapter(source.format, targetFormat);
    if (!adapter) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `No adapter found for ${source.format} → ${targetFormat}`,
        timestamp: Date.now(),
      });
    }

    return adapter.adapt(source);
  }

  /**
   * Get all registered adapters
   */
  getAllAdapters(): ContractAdapter[] {
    return Array.from(this.adapters.values());
  }

  /**
   * Clear all adapters
   */
  clear(): void {
    this.adapters.clear();
  }

  /**
   * Get adapter count
   */
  count(): number {
    return this.adapters.size;
  }
}

/**
 * Backward compatibility transformer
 */
export class BackwardCompatibilityTransformer {
  /**
   * Transform new format to legacy format
   */
  static toLegacy(newContract: ContractRepresentation, legacyVersion: string): ValidationResult<Record<string, unknown>> {
    try {
      if (newContract.format === ContractFormat.JsonSchema) {
        const schema = newContract.content as JsonSchema;
        const legacy = {
          type: schema.type,
          properties: schema.properties,
          required: schema.required,
        };

        return validationSuccess(legacy);
      }

      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Warning,
        message: `Unsupported format for legacy transformation: ${newContract.format}`,
        timestamp: Date.now(),
      });
    } catch (error) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `Legacy transformation failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Transform legacy format to new format
   */
  static fromLegacy(legacyContract: Record<string, unknown>): ValidationResult<ContractRepresentation> {
    try {
      const schema: JsonSchema = {
        $schema: 'https://json-schema.org/draft-07/schema#',
        type: (legacyContract.type as string) || 'object',
        properties: legacyContract.properties as Record<string, JsonSchema> | undefined,
        required: legacyContract.required as string[] | undefined,
      };

      return validationSuccess({
        format: ContractFormat.JsonSchema,
        version: '7',
        content: schema,
      });
    } catch (error) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `Legacy import failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }
}
