import json
from pathlib import Path

from .models import ReasoningRequest, ReasoningResponse


ROOT = Path(__file__).resolve().parents[2]
SCHEMA_DIR = ROOT / "python" / "generated-schemas"


def write_schema(filename: str, schema: dict) -> None:
    SCHEMA_DIR.mkdir(parents=True, exist_ok=True)
    path = SCHEMA_DIR / filename
    path.write_text(
        json.dumps(schema, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {path}")


def main() -> None:
    write_schema(
        "request.schema.json",
        ReasoningRequest.model_json_schema(),
    )
    write_schema(
        "response.schema.json",
        ReasoningResponse.model_json_schema(),
    )


if __name__ == "__main__":
    main()
