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

- `backend/typescript/reasoning/python-client.ts` compiles the JSON schemas
  with AJV and validates every request/response crossing the TypeScript/Python
  boundary.
- `backend/python/app/models/reasoning.py` mirrors the same shapes with Pydantic
  so the Python service validates on its side as well.

## Changing a schema

1. Edit the JSON schema file.
2. Update the matching TypeScript interfaces and Pydantic models.
3. Run the builds and tests on **both** runtimes.
4. Do not merge until both sides agree on the new contract.
