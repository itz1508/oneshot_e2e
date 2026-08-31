import importlib.util,json,subprocess,sys,unittest
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
EXPECTED=('canonicalize','create_hash','resolve_artifact','run_fixture','trace_artifact','validate_artifact','validate_graph','validate_parity','validate_references','validate_registry','validate_schema','verify_hash')
class TestSkillSurface(unittest.TestCase):
 def registry(self):
  p=ROOT/'skill/oneshot-canonical-contracts/tool/registry.py';spec=importlib.util.spec_from_file_location('skill_registry_test',p);m=importlib.util.module_from_spec(spec);sys.modules[spec.name]=m;spec.loader.exec_module(m);return m.build_tool_registry(ROOT)
 def test_registry_exact_surface(self):self.assertEqual(EXPECTED,self.registry().names())
 def test_wrappers_are_executable(self):
  for tool in ('validate_schema','validate_registry','validate_graph'):
   p=ROOT/f'skill/oneshot-canonical-contracts/scripts/{tool}.py';r=subprocess.run([sys.executable,str(p)],input='{}',text=True,capture_output=True,cwd=ROOT);self.assertEqual(0,r.returncode,(tool,r.stderr));self.assertIsInstance(json.loads(r.stdout),dict)
if __name__=='__main__':unittest.main()
