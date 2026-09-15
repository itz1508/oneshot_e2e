# Frontend migration: app/web → frontend/web

Status: Phases 1–5 complete and verified. Phase 6 (retire `app/web`) is
deferred until the Web Builder's feature tree replaces the legacy console
surface.

## Completed

| Phase | Scope | Verification |
| --- | --- | --- |
| 1 | `frontend/web/` package scaffold (package.json, tsconfig, next.config, layout/page, scripts) | typecheck, lint, static-export build pass |
| 2 | Shared infrastructure: `app/web/lib` → `src/lib`, `app/web/components` → `src/components`, legacy console modules → `src/console`, design tokens → `app/globals.css` | Imports resolve; build passes |
| 3 | Test suite: 9 legacy test files → `frontend/web/tests/` with rewritten import paths (`../src/console/*.js`) | 45/45 tests pass via `node --test tests/*.test.mjs` |
| 4 | Routes: `app/`, `chat/`, `chat/[conversationId]/`, `providers/`, `providers/new/`, `providers/[providerId]/` migrated with `generateStaticParams()` seeds for static export | Build exports all routes to `frontend/web/dist` |
| 5 | Switchover: root `build`/`build:ui` now build `frontend/web`; backend serves `frontend/web/dist` when present | `GET /` returns byte-identical content to `frontend/web/dist/index.html`; `/api/health` 200 |

Not migrated (intentional): `app/web/app/researcher/` seed stub. It stores
provider API keys in localStorage and uses a mock runtime adapter, both of
which violate the credential policy and are replaced by the Web Builder's
server-backed feature tree.

## Switchover mechanics

- `package.json` → `build:ui: npm --prefix frontend/web run build`;
  `build: tsc -p tsconfig.json && npm run build:ui`.
- `backend/index.ts` resolves the UI root as
  `frontend/web/dist` → `app/web/dist` → `ui/` (first existing wins).
- Layout guard (`scripts/guard/layout.mjs`) recognizes `frontend/`.

## Rollback

1. Revert root `package.json` `build`/`build:ui` to `app/web`.
2. In `backend/index.ts`, restore
   `const webDistPath = resolve(projectRoot, "app/web/dist");` and the
   single-fallback `uiRoot` line.
3. Remove the `frontend/` entry from `scripts/guard/layout.mjs`.
4. `npm run build:backend && npm --prefix app/web run build` — the server
   serves the legacy build unchanged.

Rollback is safe because `app/web/` is untouched and the legacy build in
`app/web/dist/` still exists.

## Phase 6 (deferred): retire app/web

Blocked until the Web Builder ships the full feature tree
(chat/conversations/providers/models/routing/evidence/review) and browser
tests cover it. Then delete `app/web/`, drop the `app/web/dist` fallback
from `backend/index.ts`, and remove `frontend/web/src/console` once no test
depends on the legacy modules.
