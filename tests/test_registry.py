import unittest
from pathlib import Path
from validation.registry import build_registry
from validation.schema_validator import SchemaStore
ROOT=Path(__file__).resolve().parents[1]
class TestRegistry(unittest.TestCase):
 def test_registry(self):
  r=build_registry(ROOT/'schema'); s=SchemaStore(ROOT/'schema'); self.assertEqual([],s.validate('urn:oneshot:schema:contract-registry:1',r)); self.assertEqual(len(list((ROOT/'schema').glob('*.schema.json'))),len(r['contracts']))
