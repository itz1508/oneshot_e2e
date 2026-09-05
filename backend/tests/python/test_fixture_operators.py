import copy,json,sys,unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.schema_validator import SchemaStore
from validation.triple_validation import run_triple
ROOT=Path(__file__).resolve().parents[3]
class TestFixtureOperators(unittest.TestCase):
 def setUp(self): self.b=json.loads((ROOT/'app/fixtures/e2e/complete-success.json').read_text());self.s=SchemaStore(ROOT/'backend/schema');self.g=json.loads((ROOT/'backend/workflow/graph.json').read_text())
 def fixture(self):
  e=['evidence:research'];p=self.b['plan'];return {'fixture_id':self.b['fixture']['fixture_id'],'researcher_id':self.b['fixture']['researcher_id'],'plan_assertions':[
   {'assertion_id':'exists','operator':'exists','target':'$.plan_id','evidence_ids':e},
   {'assertion_id':'equals','operator':'equals','target':'$.plan_id','expected':p['plan_id'],'evidence_ids':e},
   {'assertion_id':'contains','operator':'contains','target':'$.steps.0.requirement_refs','expected':'req:001','evidence_ids':e},
   {'assertion_id':'matches','operator':'matchesSchema','target':'$','expected':'urn:oneshot:schema:plan:1','evidence_ids':e},
   {'assertion_id':'references','operator':'references','target':'$.steps.0.goal_refs','expected':'criterion:001','evidence_ids':e},
   {'assertion_id':'edge','operator':'edgeExists','target':'$.plan_id','expected':{'from':'Researcher','to':'Planner','artifact':'plan_id'},'evidence_ids':e},
   {'assertion_id':'files','operator':'allFilesSpecified','target':'$.steps.0.requirement_refs','expected':['req:001'],'evidence_ids':e}]}
 def test_all_operators_positive_and_negative(self):
  f=self.fixture();v=copy.deepcopy(self.b['validation']);v['fixture_validation']['assertion_ids']=[a['assertion_id'] for a in f['plan_assertions']];r=run_triple(self.b['plan'],v,self.b['schema_artifact'],f,self.b['goal'],self.s,self.g);self.assertEqual('VALID',r['fixture_validation']['result'])
  mut={'exists':lambda a:a.update(target='$.missing'),'equals':lambda a:a.update(expected='wrong'),'contains':lambda a:a.update(expected='missing'),'matches':lambda a:a.update(expected='urn:oneshot:schema:prompt:1'),'references':lambda a:a.update(expected='missing'),'edge':lambda a:a.update(expected={'from':'No','to':'Planner'}),'files':lambda a:a.update(expected=['missing'])}
  for aid,fn in mut.items():
   bad=copy.deepcopy(f);fn(next(a for a in bad['plan_assertions'] if a['assertion_id']==aid));r=run_triple(self.b['plan'],v,self.b['schema_artifact'],bad,self.b['goal'],self.s,self.g);self.assertEqual('NOT_VALID',r['fixture_validation']['result'],aid)
 def test_invalid_schema_document_not_valid(self):
  bad=copy.deepcopy(self.b['schema_artifact']);bad['schema_document']={'type':123};r=run_triple(self.b['plan'],self.b['validation'],bad,self.b['fixture'],self.b['goal'],self.s,self.g);self.assertEqual('NOT_VALID',r['schema_validation']['result'])
 def test_validation_route_plan_id_mismatch_rejected(self):
  v=copy.deepcopy(self.b['validation'])
  v['goal_validation']['plan_id']='wrong'
  with self.assertRaisesRegex(ValueError,'validation routing mismatch'):
   run_triple(self.b['plan'],v,self.b['schema_artifact'],self.b['fixture'],self.b['goal'],self.s,self.g)
if __name__=='__main__':unittest.main()
