# Runtime Containment Implementation Summary

## Implementation Date
March 9, 2026 (updated 2026-09-04 for Phase 5 — failure-recovery workflow)

## Overview
This document summarizes the implementation of runtime containment and architectural improvements to the OneShot Production E2E system.

## Changes Implemented

### 1. Runtime Containment (CRITICAL) ✅

**Problem**: Legacy `data/` directory was still being used by judge launch scripts, conflicting with the proper `.runtime/` directory structure.

**Solution**:
- Updated `scripts/judge-launch.sh` to use `.runtime/` instead of `data/`
- Updated `scripts/installation/mac/judge-launch.sh` to use `.runtime/` instead of `data/`
- All runtime data now flows through `.runtime/` directory

**Files Modified**:
- `scripts/judge-launch.sh`
- `scripts/installation/mac/judge-launch.sh`

**Directory Structure Enforced**:
```
.runtime/
├── runs/              # Run artifacts and evidence
├── run-state/         # Run snapshots
├── task-events/       # Event store
├── checkpoints/       # Task checkpoints
├── conversations/     # Intent conversations
├── sandbox-workspaces/# Sandbox execution workspaces
├── cache/             # Cached data
├── uploads/           # Uploaded files
└── qc/                # Quality control data
```

### 2. Judge Experience ✅

**Problem**: No unified judge workflow or documentation existed.

**Solution**:
- Created `docs/judge/` directory with comprehensive documentation
- Created `npm run judge` command for judge workflow
- Implemented judge launcher script with all required features

**Files Created**:
- `docs/judge/START_HERE.md` - Entry point documentation
- `docs/judge/EXPECTED_RESULT.md` - Success criteria
- `docs/judge/TROUBLESHOOTING.md` - Common issues and solutions
- `scripts/judge.mjs` - Judge launcher script

**Judge Workflow Features**:
1. ✅ Inspects environment (Node.js, npm, Python)
2. ✅ Opens walkthrough video immediately (detached, platform-appropriate)
3. ✅ Continues bootstrap without waiting for video
4. ✅ Installs only what is necessary
5. ✅ Builds the application
6. ✅ Runs required verification
7. ✅ Starts the server
8. ✅ Polls the real health endpoint
9. ✅ Verifies the application HTTP surface
10. ✅ Opens the live app after readiness
11. ✅ Clearly reports success or root cause

**Platform Handling**:
- Windows: `start`
- macOS: `open`
- Linux: `xdg-open`

### 3. Bootstrap Consolidation ✅

**Problem**: Multiple bootstrap entry points with duplicated logic.

**Solution**:
- Created `scripts/bootstrap.mjs` as unified entry point
- Added `npm run bootstrap` command to package.json

**Files Created**:
- `scripts/bootstrap.mjs` - Unified bootstrap script

**Features**:
- Preflight checks (Node.js, npm)
- Dependency installation
- TypeScript compilation
- UI build
- Clear status reporting

### 4. Version Policy ✅

**Problem**: Version requirements scattered across multiple locations.

**Solution**:
- Created `scripts/config/toolchain.json` as single source of truth
- Documents version requirements for Node.js, npm, Python, TypeScript

### 5. Failure-Recovery Workflow (Phase 5) ✅

**Problem**: A legitimate sandbox/build/validation failure was the end of a run with no structured path to recovery.

**Solution**:
- Created `backend/recovery/` module: taxonomy (`types.ts`), bounded evidence collection (`evidence.ts`), normalized classification (`classifier.ts`), root-cause analysis (`analysis.ts`), bounded research escalation (`research-escalation.ts`), retry policy (`policy.ts`), state machine + persistence (`orchestrator.ts`).
- Eight normalized failure categories: `PROVIDER_{CONFIGURATION,AUTH,MODEL,NETWORK}_FAILURE`, `WORKFLOW_INTERNAL_FAILURE`, `SANDBOX_EXECUTION_FAILURE`, `BUILD_FAILURE`, `VALIDATION_FAILURE`, `RESEARCH_EVIDENCE_INSUFFICIENT`.
- Provider/config failures are classified before sandbox execution.
- Research escalation is bounded (≤1 per failure) and Tavily remains optional.
- Retries are policy-gated and bounded — auth/model/config failures do not auto-retry; build/validation/sandbox failures retry only after a concrete correction; network failures retry with bounded backoff.
- Only verified canonical success (Builder → Sandbox → Validation → Hash Verification) can mark a run `DONE`; recovery **never** marks a failed run `PASSED`.

**Files Created**:
- `backend/recovery/types.ts`
- `backend/recovery/evidence.ts`
- `backend/recovery/classifier.ts`
- `backend/recovery/analysis.ts`
- `backend/recovery/research-escalation.ts`
- `backend/recovery/policy.ts`
- `backend/recovery/orchestrator.ts`
- `backend/recovery/index.ts`
- `backend/tests/ts/recovery.test.ts` (24 scenarios)
- `app/web/src/recovery-view.js` (main-workspace failure card)
- `app/web/tests/recovery-view.test.mjs` (3 scenarios)

**Integration**: `backend/runtime/workflow-runtime.ts` (recovery on ROOT_CAUSE, clearOnSuccess on verified PASSED), `backend/runtime/queue.ts` (provider-binding failures recover before sandbox), `backend/runtime/run-repository.ts` (`update()` for durable recovery state), `backend/server/http-server.ts` (`/api/runs/:id/recovery` + `/recovery/context`).

## Package.json Scripts ✅

**Added Scripts**:
```json
{
  "judge": "node scripts/judge.mjs",
  "bootstrap": "node scripts/bootstrap.mjs"
}
```

## Backend & Frontend Assessment

**Backend Structure**: Already well-organized with proper separation of concerns. No changes needed.

**Frontend Structure**: `app/web/` is the only frontend - consolidation already complete. No changes needed.

## Migration Notes

### Legacy `data/` Directory

**Current Status**:
- `.runtime/` is the authoritative runtime directory for all new runs.
- An orphaned `data/test-intent-prompt-direction/` directory still exists (19 conversation JSON files from an earlier experiment). No current source writes to it.
- The `data/` directory is **not** part of the canonical runtime path and should not be referenced by any current script.

**Recommended Next Steps**:
1. Confirm no current source writes to `data/` (verified: no matches in `backend/**/*.ts`, `scripts/**/*.mjs`, `scripts/**/*.py`).
2. Back up `data/` contents if historically needed.
3. Remove the legacy `data/` directory.

## Usage

### Running the Judge Workflow

```bash
# Run judge workflow
npm run judge

# Or use POSIX judge launcher
./scripts/judge-launch.sh
```

### Running Bootstrap

```bash
# Run unified bootstrap
npm run bootstrap
```

## Verification

```bash
# Check runtime directories exist
ls -la .runtime/

# Verify syntax of new scripts
node --check scripts/judge.mjs
node --check scripts/bootstrap.mjs

# Check package.json scripts
npm run judge --help
npm run bootstrap --help
```

## Conclusion

All critical runtime containment issues have been resolved. The system now:
- Uses `.runtime/` exclusively for runtime artifacts
- Provides comprehensive judge documentation and workflow
- Has unified bootstrap entry point
- Documents version requirements centrally
- Maintains clean separation of runtime data from source code

**Note on Docker**: The Dockerfile and `docker-compose.local.yml` are provided and reference current paths. However, the Docker image has **NOT** been re-built or verified in this session — the Docker daemon is not currently running on this machine. The image build status is unverified. Run `docker build -t oneshot:latest .` and verify before claiming a working container image.


**Files Created**:
- `scripts/config/toolchain.json` - Centralized version policy

**Policy**:
- Node.js: >=24.13.0
- npm: >=11.8.0
- Python: >=3.11.0
- TypeScript: 5.8.3 (pinned)
