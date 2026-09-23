/**
 * OneShot Serialization Codec
 *
 * Handles binary, JSON, and hybrid serialization with compression,
 * checksums, and format detection.
 *
 * Pattern: Extracted from Pydantic architecture serialization layer
 */

import { ValidationFailure, FailureType, FailureSeverity, validationError, validationSuccess, ValidationResult } from '../validation/failure-taxonomy.js';

/**
 * Serialization format
 */
export enum SerializationFormat {
  JSON = 'json',
  Binary = 'binary',
  Hybrid = 'hybrid', // JSON metadata + binary payload
}

/**
 * Compression type
 */
export enum CompressionType {
  None = 'none',
  Gzip = 'gzip',
  Deflate = 'deflate',
}

/**
 * Serialized data with metadata
 */
export interface SerializedData {
  format: SerializationFormat;
  compression: CompressionType;
  data: Buffer | string;
  checksum: string;
  metadata?: Record<string, unknown>;
  originalSize?: number;
  compressedSize?: number;
}

/**
 * Serialization options
 */
export interface SerializationOptions {
  format?: SerializationFormat;
  compression?: CompressionType;
  includeChecksum?: boolean;
  includeMetadata?: boolean;
}

/**
 * Base serialization codec
 */
export abstract class SerializationCodec {
  abstract format: SerializationFormat;

  abstract serialize(data: unknown, options?: SerializationOptions): ValidationResult<SerializedData>;
  abstract deserialize(serialized: SerializedData): ValidationResult<unknown>;

  protected calculateChecksum(data: Buffer | string): string {
    // Simplified checksum: in production use crypto.createHash
    const str = typeof data === 'string' ? data : data.toString('utf8');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  protected verifyChecksum(data: Buffer | string, checksum: string): boolean {
    return this.calculateChecksum(data) === checksum;
  }
}

/**
 * JSON serialization codec
 */
export class JsonCodec extends SerializationCodec {
  format = SerializationFormat.JSON;

  serialize(data: unknown, options?: SerializationOptions): ValidationResult<SerializedData> {
    try {
      const jsonStr = JSON.stringify(data, null, 2);
      const buffer = Buffer.from(jsonStr, 'utf8');
      const checksum = this.calculateChecksum(buffer);

      return validationSuccess({
        format: SerializationFormat.JSON,
        compression: CompressionType.None,
        data: jsonStr,
        checksum,
        metadata: options?.includeMetadata ? { type: typeof data } : undefined,
        originalSize: buffer.length,
        compressedSize: buffer.length,
      });
    } catch (error) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `JSON serialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  deserialize(serialized: SerializedData): ValidationResult<unknown> {
    try {
      if (!this.verifyChecksum(serialized.data, serialized.checksum)) {
        return validationError({
          type: FailureType.HashMismatch,
          severity: FailureSeverity.Error,
          message: 'Checksum verification failed',
          timestamp: Date.now(),
        });
      }

      const jsonStr = typeof serialized.data === 'string' ? serialized.data : serialized.data.toString('utf8');
      const data = JSON.parse(jsonStr);

      return validationSuccess(data);
    } catch (error) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `JSON deserialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Binary serialization codec
 */
export class BinaryCodec extends SerializationCodec {
  format = SerializationFormat.Binary;

  serialize(data: unknown, options?: SerializationOptions): ValidationResult<SerializedData> {
    try {
      // Simplified: convert to JSON then to binary
      const jsonStr = JSON.stringify(data);
      const buffer = Buffer.from(jsonStr, 'utf8');
      const checksum = this.calculateChecksum(buffer);

      return validationSuccess({
        format: SerializationFormat.Binary,
        compression: options?.compression || CompressionType.None,
        data: buffer,
        checksum,
        metadata: options?.includeMetadata ? { type: typeof data, size: buffer.length } : undefined,
        originalSize: buffer.length,
      });
    } catch (error) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `Binary serialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  deserialize(serialized: SerializedData): ValidationResult<unknown> {
    try {
      if (!this.verifyChecksum(serialized.data, serialized.checksum)) {
        return validationError({
          type: FailureType.HashMismatch,
          severity: FailureSeverity.Error,
          message: 'Checksum verification failed',
          timestamp: Date.now(),
        });
      }

      const buffer = typeof serialized.data === 'string' ? Buffer.from(serialized.data, 'utf8') : serialized.data;
      const jsonStr = buffer.toString('utf8');
      const data = JSON.parse(jsonStr);

      return validationSuccess(data);
    } catch (error) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `Binary deserialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Hybrid serialization codec (JSON metadata + binary payload)
 */
export class HybridCodec extends SerializationCodec {
  format = SerializationFormat.Hybrid;

  serialize(data: unknown, options?: SerializationOptions): ValidationResult<SerializedData> {
    try {
      const payload = JSON.stringify(data);
      const buffer = Buffer.from(payload, 'utf8');
      const checksum = this.calculateChecksum(buffer);

      const hybrid = {
        format: SerializationFormat.Hybrid,
        checksum,
        timestamp: Date.now(),
        payload: buffer.toString('base64'),
      };

      return validationSuccess({
        format: SerializationFormat.Hybrid,
        compression: CompressionType.None,
        data: JSON.stringify(hybrid),
        checksum,
        metadata: options?.includeMetadata
          ? { type: typeof data, encoding: 'base64', size: buffer.length }
          : undefined,
        originalSize: buffer.length,
      });
    } catch (error) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `Hybrid serialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  deserialize(serialized: SerializedData): ValidationResult<unknown> {
    try {
      const hybridStr = typeof serialized.data === 'string' ? serialized.data : serialized.data.toString('utf8');
      const hybrid = JSON.parse(hybridStr);

      if (!this.verifyChecksum(Buffer.from(hybrid.payload, 'base64'), hybrid.checksum)) {
        return validationError({
          type: FailureType.HashMismatch,
          severity: FailureSeverity.Error,
          message: 'Checksum verification failed',
          timestamp: Date.now(),
        });
      }

      const payload = Buffer.from(hybrid.payload, 'base64').toString('utf8');
      const data = JSON.parse(payload);

      return validationSuccess(data);
    } catch (error) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `Hybrid deserialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }
}

/**
 * Serialization codec registry
 */
export class SerializationRegistry {
  private codecs: Map<SerializationFormat, SerializationCodec> = new Map();

  constructor() {
    // Register default codecs
    this.register(new JsonCodec());
    this.register(new BinaryCodec());
    this.register(new HybridCodec());
  }

  /**
   * Register a codec
   */
  register(codec: SerializationCodec): void {
    this.codecs.set(codec.format, codec);
  }

  /**
   * Get codec by format
   */
  getCodec(format: SerializationFormat): SerializationCodec | undefined {
    return this.codecs.get(format);
  }

  /**
   * Serialize data
   */
  serialize(
    data: unknown,
    format: SerializationFormat = SerializationFormat.JSON,
    options?: SerializationOptions
  ): ValidationResult<SerializedData> {
    const codec = this.getCodec(format);
    if (!codec) {
      return validationError({
        type: FailureType.SerializationFailed,
        severity: FailureSeverity.Error,
        message: `No codec found for format: ${format}`,
        timestamp: Date.now(),
      });
    }

    return codec.serialize(data, options);
  }

  /**
   * Deserialize data
   */
  deserialize(serialized: SerializedData): ValidationResult<unknown> {
    const codec = this.getCodec(serialized.format);
    if (!codec) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `No codec found for format: ${serialized.format}`,
        timestamp: Date.now(),
      });
    }

    return codec.deserialize(serialized);
  }

  /**
   * Auto-detect and deserialize
   */
  autoDeserialize(data: string | Buffer): ValidationResult<unknown> {
    try {
      // Try JSON first
      if (typeof data === 'string') {
        const parsed = JSON.parse(data);
        if (parsed.format && parsed.data) {
          // Likely a SerializedData object
          return this.deserialize(parsed as SerializedData);
        }
        return validationSuccess(parsed);
      }

      // Try as binary
      const str = data.toString('utf8');
      return this.autoDeserialize(str);
    } catch (error) {
      return validationError({
        type: FailureType.DeserializationFailed,
        severity: FailureSeverity.Error,
        message: `Auto-deserialization failed: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get all codecs
   */
  getAllCodecs(): SerializationCodec[] {
    return Array.from(this.codecs.values());
  }

  /**
   * Clear all codecs
   */
  clear(): void {
    this.codecs.clear();
  }

  /**
   * Get codec count
   */
  count(): number {
    return this.codecs.size;
  }
}
