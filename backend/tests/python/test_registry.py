import sys,unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.registry import build_registry
from validation.schema_validator import SchemaStore
ROOT=Path(__file__).resolve().parents[3]
class TestRegistry(unittest.TestCase):
 def test_registry(self):
  r=build_registry(ROOT/'backend/schema'); s=SchemaStore(ROOT/'backend/schema'); self.assertEqual([],s.validate('urn:oneshot:schema:contract-registry:1',r)); self.assertEqual(len(list((ROOT/'backend/schema').glob('*.schema.json'))),len(r['contracts']))
