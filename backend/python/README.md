# OneShot Python Reasoner

A FastAPI/Pydantic service that owns the reasoning boundary for OneShot. It
does **not** know about BullMQ, Redis, or the HTTP API. It only implements the
contracts in `backend/schema/reasoning`.

Pydantic gives Python typed models and validation, but the real contract is the
JSON Schema in `backend/schema/reasoning`. The app validates every request and
response against those schemas as well (see `app/contracts.py`).

## Local development

```bash
cd backend/python
python -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

export ONESHOT_INTERNAL_TOKEN="local-development-secret"
python -m uvicorn app.main:app --host 127.0.0.1 --port 8100
```

## Test

```bash
pytest
```

## Export schemas

Export Pydantic schemas for comparison with the authoritative shared contracts:

```bash
python -m app.export_schema
```

This writes:

```text
backend/python/generated-schemas/request.schema.json
backend/python/generated-schemas/response.schema.json
```

These are comparison artifacts; they do not overwrite the shared contracts.

## Integration with TypeScript

Set these environment variables when starting the OneShot server or worker:

```env
PYTHON_REASONER_URL=http://127.0.0.1:8100
ONESHOT_INTERNAL_TOKEN=local-development-secret
```

The TypeScript client in `backend/reasoning/python-client.ts` validates every
request and response against the shared JSON schemas.
