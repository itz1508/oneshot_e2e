import copy,json,unittest
from pathlib import Path
from validation.schema_validator import SchemaStore
from validation.triple_validation import run_triple
from validation.evaluation import evaluate_plan
from validation.reference_validator import validate_references
from validation.hash_proof import create_hash,verify_hash
ROOT=Path(__file__).resolve().parents[1]
class TestE2E(unittest.TestCase):
 def setUp(self):
  self.b=json.loads((ROOT/'fixtures/e2e/complete-success.json').read_text()); self.s=SchemaStore(ROOT/'schema'); self.g=json.loads((ROOT/'workflow/graph.json').read_text())
 def build_confirmed(self):
  ev=evaluate_plan(self.b['plan'],self.b['goal'],self.b['researcher'],self.b['fixture'],self.b['schema_artifact'],self.b['validation']); self.assertEqual('PASSED',ev['result'])
  self.b['evaluation']=ev
  t=run_triple(self.b['plan'],self.b['validation'],self.b['schema_artifact'],self.b['fixture'],self.b['goal'],self.s,self.g); self.assertTrue(t['all_valid'])
  core={k:self.b[k] for k in ['researcher','plan','schema_artifact','fixture','goal','validation','audit','gap_analysis','evaluation']}; core['triple_validation']=t
  pkg={'confirmed':True,'core':core}; self.s.assert_valid('urn:oneshot:schema:confirmed-package:1',pkg); self.assertEqual([],validate_references(core)); return pkg
 def test_complete_success_hash_equality(self):
  pkg=self.build_confirmed(); h=create_hash(pkg['core']); proof=verify_hash(pkg['core'],h); self.assertTrue(proof['equal']); self.s.assert_valid('urn:oneshot:schema:hash-proof:1',proof)
 def test_schema_not_valid(self):
  bad=copy.deepcopy(self.b['schema_artifact']); bad['schema_document']['properties']['plan_id']={'const':'plan:changed'}
  t=run_triple(self.b['plan'],self.b['validation'],bad,self.b['fixture'],self.b['goal'],self.s,self.g); self.assertEqual('NOT_VALID',t['schema_validation']['result']); self.assertFalse(t['all_valid'])
 def test_goal_not_valid(self):
  bad=copy.deepcopy(self.b['plan']); bad['steps'][0]['goal_refs']=[]
  t=run_triple(bad,self.b['validation'],self.b['schema_artifact'],self.b['fixture'],self.b['goal'],self.s,self.g); self.assertEqual('NOT_VALID',t['goal_validation']['result']); self.assertFalse(t['all_valid'])
 def test_hash_mismatch(self):
  pkg=self.build_confirmed(); h=create_hash(pkg['core']); changed=copy.deepcopy(pkg['core']); changed['plan']['steps'][0]['description']='changed'; self.assertFalse(verify_hash(changed,h)['equal'])
