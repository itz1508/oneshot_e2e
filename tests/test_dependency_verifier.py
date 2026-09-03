from __future__ import annotations
import importlib.util,tempfile,unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
SPEC=importlib.util.spec_from_file_location('verify_dependencies',ROOT/'app/scripts/verify_dependencies.py')
assert SPEC and SPEC.loader
VERIFY=importlib.util.module_from_spec(SPEC);SPEC.loader.exec_module(VERIFY)

class DependencyVerifierTests(unittest.TestCase):
 def test_adk_provider_selects_adk_pins(self):
  self.assertEqual([path.name for path in VERIFY.requirement_files('adk_gemma2')],['base.txt','adk.txt'])
 def test_exact_mismatch_and_missing_are_deterministic(self):
  with tempfile.TemporaryDirectory() as directory:
   path=Path(directory)/'requirements.txt';path.write_text('present==1.0\nmismatch==2.0\nmissing==3.0\n',encoding='utf-8')
   def lookup(name):
    if name=='missing':raise LookupError('not installed')
    return {'present':'1.0','mismatch':'1.5'}[name]
   errors=VERIFY.verify_requirement_files([path],lookup)
   self.assertEqual(errors,['mismatch: 1.5 != 2.0','missing: missing (not installed)'])

if __name__=='__main__':unittest.main()
