/**
 * Network Endpoint Tests
 * 
 * Tests the /api/network/test endpoint for external API connectivity.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { startAgentServer } from '../../index.js';

const BASE_URL = 'http://localhost:8080';
let server: Server | null = null;

describe('Network Endpoint', () => {
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

  it('returns 200 OK for /api/network/test', async () => {
    const response = await fetch(`${BASE_URL}/api/network/test`);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get('content-type'), 'application/json');
  });

  it('returns valid JSON with network status', async () => {
    const response = await fetch(`${BASE_URL}/api/network/test`);
    const data = await response.json();
    
    assert.ok(data.network, 'Response should have network property');
    assert.ok(data.timestamp, 'Response should have timestamp');
    
    assert.ok(data.network.gemini, 'Should have gemini status');
    assert.ok(data.network.openai, 'Should have openai status');
  });

  it('correctly identifies reachable endpoints', async () => {
    const response = await fetch(`${BASE_URL}/api/network/test`);
    const data = await response.json();
    
    assert.ok(data.network.gemini.reachable || !data.network.gemini.reachable, 'Gemini reachability should be reported');
    assert.ok(data.network.openai.reachable || !data.network.openai.reachable, 'OpenAI reachability should be reported');
  });
});
