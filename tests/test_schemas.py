import json, unittest
from pathlib import Path
from validation.schema_validator import SchemaStore
ROOT=Path(__file__).resolve().parents[1]
class TestSchemas(unittest.TestCase):
 def test_all_schema_documents_valid(self):
  store=SchemaStore(ROOT/'schema'); self.assertGreaterEqual(len(store.schemas),19)
 def test_fixture_bundle_contracts(self):
  store=SchemaStore(ROOT/'schema'); b=json.loads((ROOT/'app/fixtures/e2e/complete-success.json').read_text())
  mapping={'prompt':'urn:oneshot:schema:prompt:1','researcher':'urn:oneshot:schema:researcher:1','plan':'urn:oneshot:schema:plan:1','schema_artifact':'urn:oneshot:schema:schema-artifact:1','fixture':'urn:oneshot:schema:fixture:1','goal':'urn:oneshot:schema:goal:1','validation':'urn:oneshot:schema:validation:1','audit':'urn:oneshot:schema:audit:1','gap_analysis':'urn:oneshot:schema:gap:1','evaluation':'urn:oneshot:schema:evaluation:1'}
  for k,c in mapping.items(): self.assertEqual([],store.validate(c,b[k]),k)
