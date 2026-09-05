import json,sys,unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.fixture_runner import run_fixture
ROOT=Path(__file__).resolve().parents[3]
class TestFixture(unittest.TestCase):
 def test_fixture(self):
  b=json.loads((ROOT/'app/fixtures/e2e/complete-success.json').read_text()); results,ok=run_fixture(b['fixture'],b['plan']); self.assertTrue(ok); self.assertTrue(all(x['satisfied'] for x in results))
