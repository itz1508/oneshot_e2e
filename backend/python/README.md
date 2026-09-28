# OneShot Python Reasoning Addon

Offline deterministic reasoning engine for OneShot.

Runs as a FastAPI service (`serve`) or a standalone CLI / subprocess
engine (`--prompt` / `--stream`) invoked by the TypeScript backend
(`backend/python-runtime.ts`) and `scripts/dry-run.mjs`.

## Setup

```powershell
cd backend/python
uv sync --frozen
uv run ruff check .
uv run ruff format --check .
uv run pytest
```

## Serve

```powershell
uv run python app/main.py serve
# POST /v1/reason, GET /health
```

## Environment

- Python `>=3.12`
- Dependencies are declared in `pyproject.toml`, pinned in `uv.lock`.
- Do not hand-edit `uv.lock`. Regenerate with `uv lock`.
