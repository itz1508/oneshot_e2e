# OneShot Python Reasoning Addon

A minimal FastAPI/Pydantic service that owns the reasoning boundary for
OneShot. It does **not** know about BullMQ, Redis, or the HTTP API. It only
implements the contracts in `backend/schema/reasoning`.

## Local development

```bash
cd backend/python
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

## Test

```bash
pytest
```

## Integration with TypeScript

Set `PYTHON_REASONING_URL=http://127.0.0.1:8000` when starting the OneShot
server. The TypeScript client in `backend/typescript/reasoning/python-client.ts`
validates every request and response against the shared JSON schemas.
