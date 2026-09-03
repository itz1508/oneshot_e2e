import json, shutil, subprocess, sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[3] / 'backend/validation/python'))
from validation.canonicalize import canonicalize
class TestCanonicalize(unittest.TestCase):
 def test_object_order(self):
  self.assertEqual(canonicalize({'b':1,'a':2}),b'{"a":2,"b":1}')
 def test_number_forms(self):
  self.assertEqual(canonicalize([1.0,1e-6,1e-7,1e20,1e21,-0.0]),b'[1,0.000001,1e-7,100000000000000000000,1e+21,0]')
 def test_node_numeric_oracle_when_available(self):
  if not shutil.which('node'): self.skipTest('node unavailable')
  vals=[1.0,1e-6,1e-7,1e20,1e21,333333333.3333333,4.5,0.002,1e-27]
  js='process.stdout.write(JSON.stringify('+json.dumps(vals)+'))'
  expected=subprocess.check_output(['node','-e',js])
  self.assertEqual(canonicalize(vals),expected)
