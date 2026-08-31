import copy,json,unittest
from pathlib import Path
from validation.schema_validator import SchemaStore
from validation.parity import prove_case
ROOT=Path(__file__).resolve().parents[1]
class TestParity(unittest.TestCase):
 def test_researcher_valid_and_unknown_field(self):
  s=SchemaStore(ROOT/'schema'); b=json.loads((ROOT/'fixtures/e2e/complete-success.json').read_text())['researcher']; c='urn:oneshot:schema:researcher:1'
  self.assertTrue(prove_case(s,c,b)['parity']); bad=copy.deepcopy(b); bad['unknown']=1
  p=prove_case(s,c,bad); self.assertTrue(p['parity']); self.assertFalse(p['schema_accepts'])
 def test_strict_type_rejection(self):
  s=SchemaStore(ROOT/'schema'); b=json.loads((ROOT/'fixtures/e2e/complete-success.json').read_text())['plan']; c='urn:oneshot:schema:plan:1'; bad=copy.deepcopy(b); bad['revision']='2'
  p=prove_case(s,c,bad); self.assertTrue(p['parity']); self.assertFalse(p['runtime_accepts'])
