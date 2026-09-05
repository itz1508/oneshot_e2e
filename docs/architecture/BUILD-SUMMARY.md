# Build Summary

**Date:** 2026-09-04
**Version:** 1.4.0 (Phase 5)
**Branch:** repair/runtime-provider-ui

## Status: ALL PASSED

| Build | Status |
|-------|--------|
| Backend TypeScript | PASS |
| Frontend | PASS |
| Python 46/46 | PASS |
| Backend TS 170 tests (2 gated skip) | PASS |

## Test Counts

- TypeScript: 50 test files (Phase 5 added recovery.test.ts - 24 tests)
- Python: 15 files, 46 tests
- Web: 31 tests + recovery-view (3 tests)

## Structure

```
backend/
├── contracts/schema/     types.ts
├── recovery/             taxonomy, root cause, research escalation, retry policy
├── tests/
│   ├── ts/               50 files
│   └── python/           15 files
└── [18 other modules]
app/web/
├── src/                  app.js, recovery-view.js
└── dist/                 8 files
```

## Commands

```
npm run build:backend
npm --prefix app/web run build
npm run verify
npm start
npm run judge
```