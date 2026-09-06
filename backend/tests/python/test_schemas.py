import json, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.schema_validator import SchemaStore
ROOT=Path(__file__).resolve().parents[3]
class TestSchemas(unittest.TestCase):
 def test_all_schema_documents_valid(self):
  store=SchemaStore(ROOT/'backend/schema'); self.assertGreaterEqual(len(store.schemas),19)
 def test_fixture_bundle_contracts(self):
  store=SchemaStore(ROOT/'backend/schema'); b=json.loads((ROOT/'app/fixtures/e2e/complete-success.json').read_text())
  mapping={'prompt':'urn:oneshot:schema:prompt:2','researcher':'urn:oneshot:schema:researcher:2','plan':'urn:oneshot:schema:plan:2','schema_artifact':'urn:oneshot:schema:schema-artifact:2','fixture':'urn:oneshot:schema:fixture:2','goal':'urn:oneshot:schema:goal:2','validation':'urn:oneshot:schema:validation:2','audit':'urn:oneshot:schema:audit:2','gap_analysis':'urn:oneshot:schema:gap:2','evaluation':'urn:oneshot:schema:evaluation:2'}
  for k,c in mapping.items(): self.assertEqual([],store.validate(c,b[k]),k)
 def test_status_contract_conditionals(self):
  store=SchemaStore(ROOT/'backend/schema')
  issue={'issue':'x','expected':'y','actual':'z','evidence_ids':[],'required_correction':'fix','recheck_target':'stage'}
  base={'event_id':'e1','sequence':1,'run_id':'r1','scope':'WORKFLOW','processor':'Test','execution_status':'Pending','created_at':'now','correlation_id':'run:r1','traceparent':'00-'+'a'*32+'-'+'b'*16+'-01'}
  self.assertEqual([],store.validate('urn:oneshot:schema:processing-event:2',base))
  for status in ('Running','Completed'):
   event={**base,'execution_status':status}
   self.assertEqual([],store.validate('urn:oneshot:schema:processing-event:2',event))
  self.assertEqual([],store.validate('urn:oneshot:schema:processing-event:2',{**base,'execution_status':'Completed','test_result':'Passed'}))
  self.assertEqual([],store.validate('urn:oneshot:schema:processing-event:2',{**base,'execution_status':'Completed','test_result':'Failed','issue_type':'Missing','issue':issue}))
  self.assertEqual([],store.validate('urn:oneshot:schema:processing-event:2',{**base,'execution_status':'Failed','issue_type':'Root Cause','issue':issue}))
  self.assertTrue(store.validate('urn:oneshot:schema:processing-event:2',{**base,'execution_status':'Completed','test_result':'Passed','issue_type':'Missing'}))
  self.assertTrue(store.validate('urn:oneshot:schema:processing-event:2',{**base,'execution_status':'Completed','test_result':'Failed'}))
  running={'run_id':'r1','pipeline_status':'Running','events':[],'artifacts':{}}
  self.assertEqual([],store.validate('urn:oneshot:schema:run-snapshot:2',running))
  self.assertEqual([],store.validate('urn:oneshot:schema:run-snapshot:2',{**running,'pipeline_status':'Done','test_result':'Passed'}))
  self.assertEqual([],store.validate('urn:oneshot:schema:run-snapshot:2',{**running,'pipeline_status':'Done','test_result':'Failed','issue_type':'Root Cause','root_cause':issue}))
  self.assertTrue(store.validate('urn:oneshot:schema:run-snapshot:2',{**running,'pipeline_status':'Done','test_result':'Failed'}))
