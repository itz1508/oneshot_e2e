import test from 'node:test';
import assert from 'node:assert';
import {
  JsonCodec,
  BinaryCodec,
  HybridCodec,
  SerializationRegistry,
  SerializationFormat,
  CompressionType,
} from '../../serialization/codec.js';

test('Serialization Codec', async (suite) => {
  await suite.test('JsonCodec serializes data', () => {
    const codec = new JsonCodec();
    const data = { name: 'Alice', age: 30 };

    const result = codec.serialize(data);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, SerializationFormat.JSON);
      assert(typeof result.value.data === 'string');
      assert(result.value.checksum);
    }
  });

  await suite.test('JsonCodec deserializes data', () => {
    const codec = new JsonCodec();
    const data = { name: 'Alice', age: 30 };

    const serialized = codec.serialize(data);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const deserialized = codec.deserialize(serialized.value);

      assert.strictEqual(deserialized.ok, true);
      if (deserialized.ok) {
        assert.deepStrictEqual(deserialized.value, data);
      }
    }
  });

  await suite.test('JsonCodec verifies checksum', () => {
    const codec = new JsonCodec();
    const data = { name: 'Alice' };

    const serialized = codec.serialize(data);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const modified = { ...serialized.value, checksum: 'invalid' };
      const result = codec.deserialize(modified);

      assert.strictEqual(result.ok, false);
      if (!result.ok) {
        assert.strictEqual(result.failures[0].type, 'hash_mismatch');
      }
    }
  });

  await suite.test('BinaryCodec serializes data', () => {
    const codec = new BinaryCodec();
    const data = { test: 'data' };

    const result = codec.serialize(data);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, SerializationFormat.Binary);
      assert(Buffer.isBuffer(result.value.data));
    }
  });

  await suite.test('BinaryCodec deserializes data', () => {
    const codec = new BinaryCodec();
    const data = { test: 'data' };

    const serialized = codec.serialize(data);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const deserialized = codec.deserialize(serialized.value);

      assert.strictEqual(deserialized.ok, true);
      if (deserialized.ok) {
        assert.deepStrictEqual(deserialized.value, data);
      }
    }
  });

  await suite.test('HybridCodec serializes data', () => {
    const codec = new HybridCodec();
    const data = { type: 'hybrid', value: 42 };

    const result = codec.serialize(data);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, SerializationFormat.Hybrid);
      assert(typeof result.value.data === 'string');
    }
  });

  await suite.test('HybridCodec deserializes data', () => {
    const codec = new HybridCodec();
    const data = { type: 'hybrid', value: 42 };

    const serialized = codec.serialize(data);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const deserialized = codec.deserialize(serialized.value);

      assert.strictEqual(deserialized.ok, true);
      if (deserialized.ok) {
        assert.deepStrictEqual(deserialized.value, data);
      }
    }
  });

  await suite.test('SerializationRegistry registers codecs', () => {
    const registry = new SerializationRegistry();

    assert.strictEqual(registry.count(), 3); // JSON, Binary, Hybrid
    assert(registry.getCodec(SerializationFormat.JSON));
    assert(registry.getCodec(SerializationFormat.Binary));
    assert(registry.getCodec(SerializationFormat.Hybrid));
  });

  await suite.test('SerializationRegistry serializes with default format', () => {
    const registry = new SerializationRegistry();
    const data = { test: 'data' };

    const result = registry.serialize(data);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, SerializationFormat.JSON);
    }
  });

  await suite.test('SerializationRegistry serializes with specific format', () => {
    const registry = new SerializationRegistry();
    const data = { test: 'data' };

    const result = registry.serialize(data, SerializationFormat.Binary);

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.value.format, SerializationFormat.Binary);
    }
  });

  await suite.test('SerializationRegistry deserializes', () => {
    const registry = new SerializationRegistry();
    const data = { test: 'data' };

    const serialized = registry.serialize(data, SerializationFormat.JSON);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const deserialized = registry.deserialize(serialized.value);

      assert.strictEqual(deserialized.ok, true);
      if (deserialized.ok) {
        assert.deepStrictEqual(deserialized.value, data);
      }
    }
  });

  await suite.test('SerializationRegistry auto-deserializes', () => {
    const registry = new SerializationRegistry();
    const data = { test: 'data' };

    const serialized = registry.serialize(data, SerializationFormat.JSON);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const jsonStr = typeof serialized.value.data === 'string' ? serialized.value.data : serialized.value.data.toString('utf8');
      const deserialized = registry.autoDeserialize(jsonStr);

      assert.strictEqual(deserialized.ok, true);
    }
  });

  await suite.test('SerializationRegistry errors on unsupported format', () => {
    const registry = new SerializationRegistry();
    registry.clear();

    const result = registry.serialize({ test: 'data' }, SerializationFormat.JSON);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert(result.failures[0].message.includes('No codec found'));
    }
  });

  await suite.test('SerializationRegistry includes metadata', () => {
    const registry = new SerializationRegistry();
    const data = { test: 'data' };

    const result = registry.serialize(data, SerializationFormat.JSON, { includeMetadata: true });

    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert(result.value.metadata);
    }
  });

  await suite.test('JsonCodec handles circular references', () => {
    const codec = new JsonCodec();
    const obj: any = { name: 'test' };
    obj.self = obj; // Circular reference

    const result = codec.serialize(obj);

    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.failures[0].type, 'serialization_failed');
    }
  });

  await suite.test('SerializationRegistry preserves array data', () => {
    const registry = new SerializationRegistry();
    const data = [1, 2, 3, { name: 'nested' }];

    const serialized = registry.serialize(data);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const deserialized = registry.deserialize(serialized.value);

      assert.strictEqual(deserialized.ok, true);
      if (deserialized.ok) {
        assert.deepStrictEqual(deserialized.value, data);
      }
    }
  });

  await suite.test('SerializationRegistry preserves null and undefined', () => {
    const registry = new SerializationRegistry();
    const data = { a: null, b: 'value' };

    const serialized = registry.serialize(data);
    assert.strictEqual(serialized.ok, true);

    if (serialized.ok) {
      const deserialized = registry.deserialize(serialized.value);

      assert.strictEqual(deserialized.ok, true);
      if (deserialized.ok) {
        assert.deepStrictEqual(deserialized.value, data);
      }
    }
  });
});
