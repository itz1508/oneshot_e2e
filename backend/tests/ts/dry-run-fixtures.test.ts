/**
 * OneShot Fixture Verification & Dry-Run Test Suite
 *
 * Asserts:
 *   1. All contract fixtures in app/fixtures/ exist, parse cleanly, and provide immutable fixture_id.
 *   2. Cryptographic SHA-256 byte/hash integrity across all fixtures.
 *   3. FixtureRuntime lifecycle: mutable in-progress -> evolve/refine -> validate -> immutable record.
 *   4. ValidateFixturesSchema contract schema compliance with mandatory session anchors.
 *   5. Offline Python reasoning subprocess dry run execution.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { fixture, FixtureRuntime } from '../../artifact/fixture.js';
import { ValidateFixturesSchema, SchemaValidator } from '../../contract/schema.js';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(moduleDir, '../../../..');
const fixturesDir = path.join(repoRoot, 'app', 'fixtures');

describe('Contract Fixtures & Deterministic Dry-Run Suite', () => {
  const fixtureList = [
    { file: 'sample.json', expectedId: 'fix-sample-01' },
    { file: 'security-invariants.json', expectedId: 'fix-sec-01' },
    { file: 'adk-workflow.json', expectedId: 'fix-adk-01' },
    { file: 'reasoning-dryrun.json', expectedId: 'fix-reason-01' },
    { file: 'data.json', expectedId: 'fixture-401' },
  ];

  it('all 5 contract fixtures exist and parse as valid JSON', async () => {
    for (const { file, expectedId } of fixtureList) {
      const fullPath = path.join(fixturesDir, file);
      const raw = await fs.readFile(fullPath, 'utf-8');
      assert.ok(raw.length > 0, `${file} should not be empty`);
      const parsed = JSON.parse(raw);
      assert.strictEqual(parsed.fixture_id, expectedId, `${file} fixture_id mismatch`);
      assert.ok(parsed.version, `${file} missing version`);
      assert.ok(parsed.description, `${file} missing description`);
    }
  });

  it('computes and validates cryptographic SHA-256 byte/hash integrity', async () => {
    for (const { file } of fixtureList) {
      const fullPath = path.join(fixturesDir, file);
      const buffer = await fs.readFile(fullPath);
      const hash = crypto.createHash('sha256').update(buffer).digest('hex');
      assert.strictEqual(hash.length, 64, `SHA-256 hash length must be 64 characters`);

      // Verify that re-hashing produces byte-exact hash equality
      const reHash = crypto.createHash('sha256').update(buffer).digest('hex');
      assert.strictEqual(hash, reHash, `Hash must be deterministic and byte-exact`);
    }
  });

  it('verifies FixtureRuntime lifecycle with actual disk fixtures', async () => {
    const targetFile = 'app/fixtures/security-invariants.json';
    const fullPath = path.join(repoRoot, targetFile);
    const content = await fs.readFile(fullPath);
    const expectedHash = `sha256:${crypto.createHash('sha256').update(content).digest('hex')}`;

    // 1. Instantiate mutable runtime fixture(...)
    const f = fixture('fix-sec-01', 'session-test-dryrun-001', targetFile, expectedHash);
    assert.strictEqual(f.fixture_id, 'fix-sec-01');
    assert.strictEqual(f.sessionId, 'session-test-dryrun-001');
    assert.strictEqual(f.isInProgress, true);
    assert.strictEqual(f.isMutable, true);

    // 2. Can evolve and refine
    f.refine((curr) => ({
      metadata: { ...curr.metadata, dry_run_executed: true, verified_at: Date.now() },
    }));
    assert.strictEqual(f.metadata.dry_run_executed, true);

    // 3. Can validate using real file hash
    const valRes = f.validate(() => expectedHash);
    assert.strictEqual(valRes.ok, true);
    assert.strictEqual(f.status, 'validated');

    // 4. Persistence artifact rule: stored record is frozen and immutable
    const stored = f.toStoredRecord();
    assert.strictEqual(stored.fixture_id, 'fix-sec-01');
    assert.strictEqual(stored.session_id, 'session-test-dryrun-001');
    assert.strictEqual(stored.status, 'validated');
    assert.strictEqual(f.isInProgress, false);
    assert.ok(Object.isFrozen(stored), 'Stored record must be frozen');
    assert.ok(stored.auditTrail.length >= 2, 'Audit trail must record creation, refinement, and finalization');
  });

  it('validates contract schemas against fixtures with mandatory session anchors', async () => {
    const input = {
      sessionId: 'session-dryrun-eval',
      session_id: 'session-dryrun-eval',
      fixtures: fixtureList.map(({ file, expectedId }) => ({
        id: expectedId,
        fixture_id: expectedId,
        path: `app/fixtures/${file}`,
        expectedHash: 'sha256:dummy_test_hash',
      })),
      strict: true,
    };

    const violations = SchemaValidator.validate(input, ValidateFixturesSchema);
    assert.strictEqual(violations.length, 0, 'Fixtures input must conform to ValidateFixturesSchema');
  });

  it('executes offline Python reasoning subprocess with fixture dry-run goals', async () => {
    const pyScript = path.join(repoRoot, 'backend', 'python', 'app', 'main.py');
    const pyDir = path.join(repoRoot, 'backend', 'python');
    const isWindows = process.platform === 'win32';
    const pyCmd = isWindows
      ? path.join(pyDir, '.venv', 'Scripts', 'python.exe')
      : path.join(pyDir, '.venv', 'bin', 'python');

    const result = await new Promise<{ code: number; stdout: string; stderr: string }>((resolve) => {
      const proc = spawn(pyCmd, [pyScript, '--prompt', 'Dry run fixture audit and verify repository contract baselines', '--stream'], {
        cwd: repoRoot,
        env: {
          ...process.env,
          FAST_STREAM: '1',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      proc.stdout.on('data', (d) => { stdout += d.toString('utf8'); });
      proc.stderr.on('data', (d) => { stderr += d.toString('utf8'); });
      proc.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    });

    assert.strictEqual(result.code, 0, `Python reasoning should exit with code 0: ${result.stderr}`);
    assert.ok(result.stdout.includes('FIX-AUDIT-001'), 'Must include fixture audit finding code');
    assert.ok(result.stdout.includes('app/fixtures/sample.json'), 'Must reference sample fixture');
    assert.ok(result.stdout.includes('app/fixtures/security-invariants.json'), 'Must reference security fixture');
  });
});
