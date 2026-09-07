# Provider integrations

This directory owns server-side provider integrations for the OneShot web application. It is separate from browser assets under `../src/`. Provider runtime state and credential values remain at their existing configured storage locations.

| Source | Responsibility |
|---|---|
| `provider-manager.ts` | Catalog, provider activation, per-run configuration capture and provider construction |
| `provider-runtime-config.ts` | Persist non-secret settings |
| `provider-secret-store.ts` | Server-side credential storage and lookup |
| `providers.json` | Versioned, non-secret provider catalog |
| `provider.ts`, `provider-resolver.ts` | Research provider contract and runtime resolution |
| `provider/{openai,anthropic,gemini}/` | Native adapters, types and worker bridges |
| `provider/shared/` | Shared worker bridge, worker-pool provider base and catalog adapter registry |
| `provider/native_worker.py`, `provider/_worker_common.py` | Native provider transport and shared worker helpers |
| `provider/featherless/` | Compatibility adapter and its worker |
| `provider/fixture-provider.ts` | Deterministic sample provider |
| `provider/structured-draft.ts` | Convert provider output to the canonical research bundle |
| `workspace/providers.py` | Provider clients for the standalone workspace API (shared client options and Gemini call teardown live beside them) |

The backend entrypoint, HTTP server, queue and researcher agent import these modules. Research evidence acquisition, canonical contracts, workflow execution and IAM identity retain their own responsibilities.

Run `npm run build:backend` at the repository root to compile TypeScript into `dist/app/web/cloud`. Worker bridges resolve Python files and the catalog from the explicit project root. The workspace API uses the Python import root `app` for both `workspace_api` and `web.cloud`; its launch command stays `uvicorn --app-dir app workspace_api.main:app` from the repository root.

The browser build copies an explicit asset list from `app/web/src`; it does not copy this directory. Docker includes compiled cloud modules, the catalog and worker source files. The source relocation preserves provider IDs, HTTP routes, credential storage, model selection and per-run binding behavior.

See the [provider audit and move record](../../../docs/PROVIDER_MIGRATION.md) and [provider API guide](../../../docs/PROVIDER_MANAGEMENT.md).
