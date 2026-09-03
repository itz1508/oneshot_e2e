import copy, json, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.schema_validator import SchemaStore
from validation.registry import build_registry
from validation.parity import prove_case
from validation.triple_validation import run_triple
from validation.evaluation import evaluate_plan
from validation.hash_proof import create_hash, verify_hash

ROOT=Path(__file__).resolve().parents[3]

class TestRuntimeParityExtended(unittest.TestCase):
    def setUp(self):
        self.s=SchemaStore(ROOT/'backend/schema')
        self.b=json.loads((ROOT/'app/fixtures/e2e/complete-success.json').read_text())
        self.g=json.loads((ROOT/'backend/workflow/graph.json').read_text())

    def test_graph_parity(self):
        p=prove_case(self.s,'urn:oneshot:schema:workflow-graph:1',self.g)
        self.assertTrue(p['parity']); self.assertTrue(p['schema_accepts'])

    def test_registry_parity(self):
        r=build_registry(ROOT/'backend/schema')
        p=prove_case(self.s,'urn:oneshot:schema:contract-registry:1',r)
        self.assertTrue(p['parity']); self.assertTrue(p['schema_accepts'])

    def test_hash_pattern_parity(self):
        good={'canonicalization_id':'oneshot-jcs-rfc8785-v1','algorithm':'sha256','created_hash':'a'*64,'recomputed_hash':'a'*64,'equal':True}
        bad=copy.deepcopy(good); bad['created_hash']='not-a-hash'
        for value,expected in [(good,True),(bad,False)]:
            p=prove_case(self.s,'urn:oneshot:schema:hash-proof:1',value)
            self.assertTrue(p['parity']); self.assertEqual(expected,p['schema_accepts'])

    def test_confirmed_and_result_contract_parity(self):
        ev=evaluate_plan(self.b['plan'],self.b['goal'],self.b['researcher'],self.b['fixture'],self.b['schema_artifact'],self.b['validation']); self.b['evaluation']=ev
        t=run_triple(self.b['plan'],self.b['validation'],self.b['schema_artifact'],self.b['fixture'],self.b['goal'],self.s,self.g)
        items=[
            ('urn:oneshot:schema:schema-validation:1',t['schema_validation']),
            ('urn:oneshot:schema:fixture-validation:1',t['fixture_validation']),
            ('urn:oneshot:schema:goal-validation:1',t['goal_validation']),
            ('urn:oneshot:schema:triple-validation:1',t),
        ]
        core={k:self.b[k] for k in ['researcher','plan','schema_artifact','fixture','goal','validation','audit','gap_analysis','evaluation']}; core['triple_validation']=t
        pkg={'confirmed':True,'core':core}; items.append(('urn:oneshot:schema:confirmed-package:1',pkg))
        h=create_hash(core); items.append(('urn:oneshot:schema:hash-proof:1',verify_hash(core,h)))
        for contract,value in items:
            p=prove_case(self.s,contract,value)
            self.assertTrue(p['parity'],contract); self.assertTrue(p['schema_accepts'],contract)

    def test_empty_identifier_parity(self):
        bad=copy.deepcopy(self.b['researcher']); bad['plan_id']=''
        p=prove_case(self.s,'urn:oneshot:schema:researcher:1',bad)
        self.assertTrue(p['parity']); self.assertFalse(p['schema_accepts'])

    def test_duplicate_unique_list_parity(self):
        bad=copy.deepcopy(self.b['researcher']); bad['requirement_ids']=['req:001','req:001']
        p=prove_case(self.s,'urn:oneshot:schema:researcher:1',bad)
        self.assertTrue(p['parity']); self.assertFalse(p['schema_accepts'])

if __name__=='__main__': unittest.main()
