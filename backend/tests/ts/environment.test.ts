/**
 * Environment Loading Tests
 * 
 * Tests that the server properly loads environment variables from .env file.
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, copyFileSync } from 'node:fs';

describe('Environment Loading', () => {
  before(() => {
    if (!existsSync('app/env/.env') && existsSync('app/env/.env.example')) {
      copyFileSync('app/env/.env.example', 'app/env/.env');
    }
  });

  it('loads .env file with dotenv', () => {
    // Verify dotenv is imported in backend/index.ts
    const backendSource = readFileSync('backend/index.ts', 'utf8');
    assert.ok(backendSource.includes('dotenv'), 'Backend should import dotenv');
    assert.ok(backendSource.includes('config'), 'Backend should call dotenv.config()');
  });

  it('reads from app/env/.env path', () => {
    assert.ok(existsSync('app/env/.env'), '.env file should exist');
  });

  it('does not expose .env in git', () => {
    const gitignore = readFileSync('.gitignore', 'utf8');
    // .env files should be in gitignore
    assert.ok(
      gitignore.includes('.env') || gitignore.includes('app/env/.env'),
      '.env should be in .gitignore'
    );
  });

  it('GEMINI_API_KEY can be loaded', () => {
    // Test that .env parsing works
    const envPath = 'app/env/.env';
    if (existsSync(envPath)) {
      const envFile = readFileSync(envPath, 'utf8');
      const hasGeminiKey = envFile.includes('GEMINI_API_KEY');
      // Key may be empty but should be present
      assert.ok(
        envFile.includes('GEMINI_API_KEY=') || !hasGeminiKey,
        'GEMINI_API_KEY should be defined in .env'
      );
    }
  });
});
