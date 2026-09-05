# Repository Migration Inventory

**Audit Date**: March 9, 2026
**Branch**: `adk-workflow-v2`
**Commit SHA**: `37c230bc92a69f83ab63d117f205407bb0373f3f`

---

## Phase 0 Audit Complete ✅

### 1. Git Baseline
- **Branch**: `adk-workflow-v2`
- **Commit**: `37c230bc92a69f83ab63d117f205407bb0373f3f`
- **Modified**: 14 files (tracked)
- **Untracked**: 17 files/dirs

### 2. Root Structure
```
oneshot_e2e/
├── .agents/              # Agent rules/skills
├── .git/                 # Repository
├── .github/              # CI/CD
├── .ollama/              # Ollama (runtime)
├── .runtime/             # Runtime directory ✅
├── .venv/                # Python venv
├── app/                  # Application
├── backend/              # Backend code
├── data/                 # LEGACY runtime ❌
├── dist/                 # Build output
├── docs/                 # Documentation
├── node_modules/         # Dependencies
└── scripts/              # Scripts
```

### 3. Frontend Audit
**Current**: `app/web/` ✅ (ACTIVE)
- `src/` - 9 source files
- `dist/` - Built assets
- `scripts/` - Build scripts
- `tests/` - Test suite

**Legacy UI**: Does NOT exist ✅

**Conclusion**: Frontend already consolidated.

### 4. Backend Structure
**Current**: 16 directories
- contract/, core/, graph/, intent/, role/, runtime/, sandbox/, schema/, scripts/, server/, skills/, task/, test/, tool/, validation/, workflow/

**Target**: Reorganize to match target architecture

### 5. Bootstrap Routes (9 identified)
1. `scripts/oneshot.mjs`
2. `scripts/bootstrap.mjs`
3. `scripts/bootstrap/index.mjs`
4. `app/bootstrap/demo.mjs`
5. `app/bootstrap/setup.bat`
6. `app/bootstrap/setup.sh`
7. `scripts/judge.mjs`
8. `Dockerfile`
9. `package.json` scripts

### 6. Runtime Paths
- **Active**: `.runtime/` ✅
- **Legacy**: `data/` ❌ (identical structure)
- **Config**: `backend/runtime/runtime-config.ts`
- **Env Var**: `ONESHOT_RUNTIME_DIR`

### 7. Python Packages
- `app/workspace_api/` - FastAPI app
- `backend/validation/python/` - Validation
- `app/requirements/` - 4 requirement files

### 8. Migration Priority
1. **Phase 1**: Runtime containment (migrate data/ → .runtime/)
2. **Phase 2**: Backend reorganization
3. **Phase 3**: Frontend consolidation

---

## Migration Map

### Runtime (Phase 1)
| Source | Target | Status |
|--------|--------|--------|
| `data/` | `.runtime/` | `.runtime/` exists, `data/` must be removed |

### Backend (Phase 2)
| Current | Target | Action |
|---------|--------|--------|
| `backend/contract/` | `backend/contracts/` | Rename |
| `backend/role/` | `backend/agents/` | Reorganize |
| `backend/test/` | `backend/tests/` | Rename |
| `app/workspace_api/` | `backend/python/workspace_api/` | Move |
| `app/requirements/` | `backend/python/requirements/` | Move |

### Frontend (Phase 3)
| Current | Target | Action |
|---------|--------|--------|
| `app/web/src/` | `app/src/` | Move |
| `app/web/tests/` | `app/tests/` | Move |

---

## Next Steps

**IMMEDIATE**: Phase 1 - Runtime Containment
1. Verify runtime-config.ts is used everywhere
2. Migrate any unique data from data/ to .runtime/
3. Remove data/ directory
4. Test with fresh run

**Document Status**: Ready for Phase 1 execution
