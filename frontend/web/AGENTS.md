# Frontend Agent Instructions

## Scope

This file applies to `frontend/web/`.

- Production frontend work belongs in `frontend/web/app/` and `frontend/web/src/`.
- `app/web/` is not present; do not recreate it as a second production frontend.
- `App.tsx` and `Composer.tsx` are the canonical chat runtime path.
- `main-screen/` and the invariant-oriented `useStream`/`useTool` contracts are reference-only until migrated; do not import them from production components.

## Commands

Run from the repository root:

```powershell
pnpm --prefix frontend/web run dev
pnpm --prefix frontend/web run typecheck
pnpm --prefix frontend/web test
pnpm --prefix frontend/web run build
pnpm --prefix frontend/web run preview
pnpm exec playwright test
```

## UX and Accessibility Rules

- Use semantic HTML and visible keyboard focus.
- Every icon-only button requires an `aria-label`.
- Form controls require a label or `aria-label`, `name`, and appropriate `autocomplete`.
- `Enter` sends, `Shift+Enter` inserts a newline.
- The composer must auto-grow from 44px to 160px and scroll internally above 160px.
- The composer must not cover the final conversation message.
- Desktop sidebar behavior must become an accessible overlay on mobile.
- Loading, empty, error, unavailable, and success states must be distinct.
- Do not use hard-coded progress, fake research, or synthetic tool execution.
- Long text, citations, tool output, and session titles must not create page-level horizontal overflow.
- All layout, focus, and responsive changes require browser coverage at mobile and desktop widths.

## Path Rules

- Use repository-relative paths in code and tests.
- Resolve filesystem paths with `path.resolve()`, `path.join()`, or `fileURLToPath(import.meta.url)`.
- Use `process.env` or CLI arguments for machine-specific browser, URL, output, and artifact locations.
- Do not commit workstation-specific absolute paths.
- Keep logical URL and virtual backend paths as URL-style paths.
