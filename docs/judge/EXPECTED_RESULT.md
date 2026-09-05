# Expected Results

This document describes what success looks like when evaluating OneShot.

## Health Checks

### 1. Backend Health Endpoint

**URL**: `http://localhost:8787/api/health`

**Expected Response**:
```json
{
  "status": "ok",
  "mode": "sample",
  "provider": "Deterministic Sample Provider"
}
```

**Verification**:
```bash
curl -H "Authorization: Bearer <token>" http://localhost:8787/api/health
```

### 2. Web UI Root

**URL**: `http://localhost:8787/`

**Expected**: HTTP 200 with HTML content containing OneShot UI

### 3. Static Assets

**URLs**:
- `http://localhost:8787/app.js` → HTTP 200
- `http://localhost:8787/styles.css` → HTTP 200

### 4. Authentication

**Expected Behavior**:
- Unauthenticated requests to `/api/health` → HTTP 401
- Authenticated requests with valid token → HTTP 200

## Functional Tests

### Browser E2E Test

The canonical browser E2E test verifies:

1. **Page Load**: UI renders correctly
2. **Intent Submission**: User can submit requests
3. **Workflow Execution**: Canonical workflow executes (Prompt → DONE)
4. **State Management**: State transitions are correct
5. **Artifact Generation**: Artifacts are created in `.runtime/`
6. **Event Streaming**: Events are streamed via SSE
7. **Checkpoint Recovery**: State can be recovered from checkpoints

### Expected Artifacts

After a successful run, `.runtime/runs/<run-id>/` should contain:

```
<run-id>/
├── artifacts/
│   ├── research/
│   ├── planning/
│   ├── refactor/
│   ├── evaluation/
│   └── evidence/
├── events/
├── logs/
└── tmp/
```

## Canonical Workflow

The system should execute this workflow:

1. **Research** → Gather context and requirements
2. **Planning** → Create implementation plan
3. **Refactor** → Improve existing code
4. **Evaluation** → Validate changes
5. **Build** → Compile/build if needed
6. **Hash** → Generate SHA-256 proof

Each step should:
- Emit events to the event bus
- Update run state
- Generate artifacts
- Create checkpoints

## Success Criteria

### Pass
- ✅ All health checks return expected responses
- ✅ Browser E2E test completes without errors
- ✅ Canonical workflow executes end-to-end
- ✅ Artifacts generated in correct locations
- ✅ State is recoverable from checkpoints
- ✅ No runtime errors in logs

### Fail
- ❌ Health endpoint returns non-200 status
- ❌ Browser E2E test fails
- ❌ Workflow execution errors
- ❌ Missing artifacts
- ❌ State corruption or loss
- ❌ Runtime errors in logs

## Evidence Collection

Judges should collect:

1. **Health check logs** - Terminal output from judge launcher
2. **Browser screenshots** - UI state during execution
3. **Run artifacts** - Generated in `.runtime/runs/<run-id>/`
4. **Event logs** - From `.runtime/task-events/`
5. **Checkpoint snapshots** - From `.runtime/checkpoints/`

## Performance Expectations

| Metric | Expected | Acceptable |
|--------|----------|------------|
| Health check response | <100ms | <500ms |
| Page load time | <2s | <5s |
| Workflow completion | <60s | <120s |
| Build time | <30s | <60s |

## Next Steps

1. Run `npm run judge` to execute the judge workflow
2. Compare actual results against expected results
3. Document any deviations
4. Consult [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for known issues
