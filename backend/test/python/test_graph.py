import json,sys,unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.schema_validator import SchemaStore
from validation.graph_validator import validate_graph
ROOT=Path(__file__).resolve().parents[3]
class TestGraph(unittest.TestCase):
 def test_graph_contract_and_semantics(self):
  g=json.loads((ROOT/'backend/workflow/graph.json').read_text()); s=SchemaStore(ROOT/'backend/schema')
  self.assertEqual([],s.validate('urn:oneshot:schema:workflow-graph:1',g)); self.assertEqual([],validate_graph(g))
