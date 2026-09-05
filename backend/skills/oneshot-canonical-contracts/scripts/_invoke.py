from __future__ import annotations
import importlib.util,json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[4]
sys.path.insert(0,str(ROOT))
sys.path.insert(0,str(Path(__file__).resolve().parents[4]/'backend/validation/python'))
def invoke(tool:str,payload:dict):
    path=ROOT/'backend/skills/oneshot-canonical-contracts/tool/registry.py';spec=importlib.util.spec_from_file_location('oneshot_skill_registry_script',path)
    if spec is None or spec.loader is None: raise RuntimeError('cannot load registry')
    mod=importlib.util.module_from_spec(spec);sys.modules[spec.name]=mod;spec.loader.exec_module(mod);return mod.build_tool_registry(ROOT).invoke(tool,payload)
def main(tool:str):
    payload=json.load(sys.stdin) if not sys.stdin.isatty() else {};json.dump(invoke(tool,payload),sys.stdout,separators=(',',':'));sys.stdout.write('\n')
