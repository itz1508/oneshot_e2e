import json,unittest
from pathlib import Path
from validation.schema_validator import SchemaStore
from validation.graph_validator import validate_graph
ROOT=Path(__file__).resolve().parents[1]
class TestGraph(unittest.TestCase):
 def test_graph_contract_and_semantics(self):
  g=json.loads((ROOT/'workflow/graph.json').read_text()); s=SchemaStore(ROOT/'schema')
  self.assertEqual([],s.validate('urn:oneshot:schema:workflow-graph:1',g)); self.assertEqual([],validate_graph(g))
