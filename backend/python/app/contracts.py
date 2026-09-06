import json
from functools import lru_cache
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator


BACKEND_DIR = Path(__file__).resolve().parents[2]
SCHEMA_DIR = BACKEND_DIR / "schema" / "reasoning"
if not SCHEMA_DIR.is_dir():
    SCHEMA_DIR = Path(__file__).resolve().parent / "schemas"


@lru_cache(maxsize=None)
def load_schema(filename: str) -> dict[str, Any]:
    path = SCHEMA_DIR / filename
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=None)
def request_validator() -> Draft202012Validator:
    return Draft202012Validator(
        load_schema("request.schema.json"),
    )


@lru_cache(maxsize=None)
def response_validator() -> Draft202012Validator:
    return Draft202012Validator(
        load_schema("response.schema.json"),
    )


def validate_request_contract(value: dict[str, Any]) -> None:
    request_validator().validate(value)


def validate_response_contract(value: dict[str, Any]) -> None:
    response_validator().validate(value)
