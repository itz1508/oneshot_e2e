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

## Fallback: pip (uv unavailable)

`requirements.txt` is a generated export of `uv.lock` (runtime + `dev` group,
local project excluded). Never hand-edit it; regenerate after any `uv lock`
change:

```bash
node scripts/setup-python.mjs --export-requirements
```

Install it from the repository root so pip resolves the file path:

```bash
python -m pip install -r backend/python/requirements.txt
```

`app/main.py` self-registers `backend/python` on `sys.path`, so the service and
CLI run without installing the `oneshot-reasoning` project itself:

```bash
python backend/python/app/main.py --prompt "fallback smoke test"
```

`scripts/install.ps1`, `scripts/install.sh`, and `app/bootstrap/setup.{bat,sh}`
prefer `uv sync --frozen`; pip is only the fallback when uv is unavailable.

## Environment

- Python `>=3.12`
- Dependencies are declared in `pyproject.toml`, pinned in `uv.lock`.
- `requirements.txt` is generated from `uv.lock` via
  `node scripts/setup-python.mjs --export-requirements`.
- Do not hand-edit `uv.lock`. Regenerate with `uv lock`.
