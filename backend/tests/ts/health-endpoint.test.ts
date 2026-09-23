/**
 * Health Endpoint Tests
 * 
 * Tests the /ping and /health endpoints for basic server health.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = 'http://localhost:8080';

describe('Health Endpoints', () => {
  it('GET /ping returns 200 with health status', async () => {
    const response = await fetch(`${BASE_URL}/ping`);
    assert.strictEqual(response.status, 200);
    
    const data = await response.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.ok, true);
    assert.strictEqual(data.version, '1.3.0');
  });

  it('GET /health returns same as /ping', async () => {
    const response = await fetch(`${BASE_URL}/health`);
    assert.strictEqual(response.status, 200);
    
    const data = await response.json();
    assert.strictEqual(data.status, 'healthy');
    assert.strictEqual(data.ok, true);
  });

  it('GET /api/health returns same as /ping', async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    assert.strictEqual(response.status, 200);
    
    const data = await response.json();
    assert.strictEqual(data.status, 'healthy');
  });

  it('returns consistent version number', async () => {
    const response = await fetch(`${BASE_URL}/ping`);
    const data = await response.json();
    
    // Version should match package.json
    assert.ok(data.version.match(/^\d+\.\d+\.\d+$/), 'Version should be semver');
  });
});
