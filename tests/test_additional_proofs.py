import copy, json, unittest
from pathlib import Path
from validation.canonicalize import canonicalize
from validation.evaluation import evaluate_plan
from validation.schema_validator import SchemaStore
from validation.triple_validation import run_triple
from validation.reference_validator import validate_references

ROOT=Path(__file__).resolve().parents[1]

class TestAdditionalProofs(unittest.TestCase):
    def setUp(self):
        self.b=json.loads((ROOT/'app/fixtures/e2e/complete-success.json').read_text())
        self.s=SchemaStore(ROOT/'schema')
        self.g=json.loads((ROOT/'workflow/graph.json').read_text())

    def test_utf16_property_order(self):
        # RFC 8785 sorts object property names by UTF-16 code units.
        self.assertEqual(canonicalize({'\ue000':1,'😀':2}), '{"😀":2,"\ue000":1}'.encode())

    def test_control_character_escaping(self):
        self.assertEqual(canonicalize({'x':'a\n\x0fb'}), b'{"x":"a\\n\\u000fb"}')

    def test_evaluation_root_cause(self):
        bad=copy.deepcopy(self.b['plan'])
        bad['steps'][0]['requirement_refs']=[]
        result=evaluate_plan(bad,self.b['goal'])
        self.assertEqual(result['result'],'ROOT_CAUSE')
        self.s.assert_valid('urn:oneshot:schema:evaluation:1',result)

    def test_fixture_not_valid(self):
        bad=copy.deepcopy(self.b['fixture'])
        bad['plan_assertions'][0]['expected']='plan:wrong'
        t=run_triple(self.b['plan'],self.b['validation'],self.b['schema_artifact'],bad,self.b['goal'],self.s,self.g)
        self.assertEqual(t['fixture_validation']['result'],'NOT_VALID')
        self.assertFalse(t['all_valid'])

    def test_unknown_field_rejected(self):
        bad=copy.deepcopy(self.b['audit']); bad['severity']='HIGH'
        self.assertTrue(self.s.validate('urn:oneshot:schema:audit:1',bad))

    def test_missing_required_field_rejected(self):
        bad=copy.deepcopy(self.b['researcher']); del bad['plan_id']
        self.assertTrue(self.s.validate('urn:oneshot:schema:researcher:1',bad))

    def test_plan_identity_continuity_fixture(self):
        before='plan:001'
        after=self.b['plan']['plan_id']
        self.assertEqual(before,after)
        self.assertGreaterEqual(self.b['plan']['revision'],2)
        self.assertTrue(self.b['plan']['revision_evidence'])

    def test_reference_mismatch_detected(self):
        ev=evaluate_plan(self.b['plan'],self.b['goal'],self.b['researcher'],self.b['fixture'],self.b['schema_artifact'],self.b['validation']); self.b['evaluation']=ev
        t=run_triple(self.b['plan'],self.b['validation'],self.b['schema_artifact'],self.b['fixture'],self.b['goal'],self.s,self.g)
        core={k:self.b[k] for k in ['researcher','plan','schema_artifact','fixture','goal','validation','audit','gap_analysis','evaluation']}; core['triple_validation']=t
        core['audit']['plan_id']='plan:other'
        self.assertTrue(any('audit.plan_id' in e for e in validate_references(core)))

if __name__=='__main__': unittest.main()
