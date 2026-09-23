/**
 * Health Endpoint Tests
 * 
 * Tests the /ping and /health endpoints for basic server health.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { startAgentServer } from '../../index.js';

const BASE_URL = 'http://localhost:8080';
let server: Server | null = null;

describe('Health Endpoints', () => {
  before(async () => {
    try {
      const res = await fetch(`${BASE_URL}/ping`);
      if (res.ok) return;
    } catch {
      server = (await startAgentServer({ port: 8080 })) as Server;
    }
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
    }
  });

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

  it('POST /api/tool/execute executes validate_fixtures with deterministic proof', async () => {
    const response = await fetch(`${BASE_URL}/api/tool/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        toolName: 'validate_fixtures',
        input: {
          fixture_id: 'fix-test-101',
          sessionId: 'sess-unit-test',
          path: 'app/fixtures/sample.json',
          expectedHash: 'sha256:7f83b1657ff1fc53b92dc18148a1d65dfc2d4b1fa3d677284addd200126d9069',
        },
      }),
    });
    assert.strictEqual(response.status, 200);
    const data = await response.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.toolName, 'validate_fixtures');
    assert.strictEqual(data.result.success, true);
    assert.strictEqual(data.result.fixture_id, 'fix-test-101');
    assert.strictEqual(data.result.status, 'passed');
    assert.strictEqual(data.result.actualHash, data.result.expectedHash);
  });

  it('POST /api/agent/stream supports Non-API Key Style Chat Bot mode and streams SSE deltas', async () => {
    const response = await fetch(`${BASE_URL}/api/agent/stream`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        prompt: 'Validate fixtures and show proof',
        provider: 'mock',
      }),
    });
    assert.strictEqual(response.status, 200);
    assert.ok(response.headers.get('content-type')?.includes('text/event-stream'));

    const text = await response.text();
    assert.ok(text.includes('RUN_START'));
    assert.ok(text.includes('TEXT_MESSAGE_DELTA'));
    assert.ok(text.includes('TOOL_CALL_START'));
    assert.ok(text.includes('validate_fixtures'));
    assert.ok(text.includes('ValidationConfirmed'));
    assert.ok(text.includes('RUN_FINISH'));
  });
});

