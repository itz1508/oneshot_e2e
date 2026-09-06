# OneShot Shared Schema

This directory is the single source of truth for cross-runtime contracts.

> **Rule:** `schema` defines the contract. TypeScript implements it. Python
> implements it. Neither side invents fields independently.

## Layout

```text
backend/schema
├── reasoning/
│   ├── request.schema.json    # Python reasoning addon input
│   └── response.schema.json   # Python reasoning addon output
├── pipeline/
│   (pipeline state/artifact contracts — to be expanded)
└── artifacts/
    (artifact contracts — to be expanded)
```

## Consumers

- `backend/reasoning/python-client.ts` compiles the JSON schemas with AJV and
  validates every request/response crossing the TypeScript/Python boundary.
- `backend/python/app/models.py` mirrors the same shapes with Pydantic.
- `backend/python/app/contracts.py` validates request/response JSON against
  the actual `backend/schema/reasoning/*.json` files using `jsonschema`, so
  Pydantic does not get to redefine the protocol independently.

## Changing a schema

1. Edit the authoritative JSON schemas here, then update the Pydantic models
   in `backend/python/app/models.py`. `python -m app.export_schema` exports
   comparison artifacts only; it does not overwrite these contracts.
2. Update the matching TypeScript interfaces in
   `backend/reasoning/python-client.ts`.
3. Run the builds and tests on **both** runtimes.
4. Do not merge until both sides agree on the new contract.
