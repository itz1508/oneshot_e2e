from __future__ import annotations
import json
from pathlib import Path
from jsonschema import Draft202012Validator
from referencing import Registry, Resource

class SchemaStore:
    def __init__(self, schema_dir: str | Path):
        self.schema_dir = Path(schema_dir)
        self.schemas: dict[str, dict] = {}
        for p in sorted(self.schema_dir.glob('*.schema.json')):
            data=json.loads(p.read_text(encoding='utf-8'))
            Draft202012Validator.check_schema(data)
            self.schemas[data['$id']]=data
        resources=[(uri, Resource.from_contents(schema)) for uri,schema in self.schemas.items()]
        self.registry=Registry().with_resources(resources)
    def validate(self, contract_id: str, value) -> list[str]:
        schema=self.schemas[contract_id]
        validator=Draft202012Validator(schema, registry=self.registry)
        return [e.message for e in sorted(validator.iter_errors(value), key=lambda e: list(e.path))]
    def assert_valid(self, contract_id: str, value):
        errors=self.validate(contract_id,value)
        if errors: raise ValueError(f'{contract_id}: ' + '; '.join(errors))

def validate_all_schema_documents(schema_dir: str | Path) -> int:
    store=SchemaStore(schema_dir)
    return len(store.schemas)
