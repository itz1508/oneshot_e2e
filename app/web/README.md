# OneShot Frontend

Next.js Pages Router static-export application for the OneShot web UI.

## Development

```bash
npm install
npm run dev
```

Dev server runs on port 5173 and uses Next.js rewrites to proxy `/api` and
`/v1` to the backend when `ONESHOT_BACKEND_TARGET` is set.

## Production build

```bash
npm run build
```

Produces `dist/` with inlined scripts externalized to `dist/_next/static/bootstrap/`
for the existing `script-src 'self'` CSP.

## Preview

```bash
npm run preview
```

Serves `dist/` and proxies `/api` and `/v1` to the backend (default
`http://127.0.0.1:8787`).
