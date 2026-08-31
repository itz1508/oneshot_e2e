from __future__ import annotations
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
import json
from jsonschema import Draft202012Validator
from validation.artifact_resolver import resolve_artifact
from validation.canonicalize import canonicalize
from validation.fixture_runner import run_fixture
from validation.graph_validator import validate_graph
from validation.hash_proof import create_hash, verify_hash
from validation.parity import prove_case
from validation.reference_validator import validate_references
from validation.registry import build_registry
from validation.schema_validator import SchemaStore, validate_all_schema_documents

@dataclass(frozen=True)
class Tool:
    name:str; description:str; callable:Callable[[dict[str,Any]],Any]
class ToolRegistry:
    def __init__(self): self._tools:dict[str,Tool]={}
    def register(self,name:str,description:str,callable:Callable[[dict[str,Any]],Any]):
        if name in self._tools: raise ValueError(f'duplicate tool {name}')
        self._tools[name]=Tool(name,description,callable)
    def resolve(self,name:str)->Tool:
        if name not in self._tools: raise KeyError(name)
        return self._tools[name]
    def names(self): return tuple(sorted(self._tools))
    def invoke(self,name:str,input:dict[str,Any]): return self.resolve(name).callable(input)

def build_tool_registry(root:str|Path)->ToolRegistry:
    root=Path(root);store=SchemaStore(root/'schema');reg=ToolRegistry()
    def validate_schema_tool(i):
        if 'schema_document' in i: Draft202012Validator.check_schema(i['schema_document']); return {'valid':True,'count':1}
        return {'valid':True,'count':validate_all_schema_documents(root/'schema')}
    def validate_artifact_tool(i):
        errors=store.validate(i['contract_id'],i['value']); parity=prove_case(store,i['contract_id'],i['value']) if i['contract_id'] in __import__('validation.parity',fromlist=['MODEL_BY_CONTRACT']).MODEL_BY_CONTRACT else {'parity':True}
        if not parity['parity']: errors=[*errors,'JSON Schema/Pydantic parity mismatch']
        return {'valid':not errors,'errors':errors}
    def validate_refs_tool(i):
        errors=validate_references(i['core']);return {'valid':not errors,'errors':errors}
    def validate_parity_tool(i): return prove_case(store,i['contract_id'],i['value'])
    def validate_registry_tool(i):
        actual=json.loads((root/'contract-registry.json').read_text());expected=build_registry(root/'schema');errors=[] if actual==expected else ['contract registry does not match canonical schema bytes/ownership map'];errors += store.validate('urn:oneshot:schema:contract-registry:1',actual);return {'valid':not errors,'errors':errors}
    def validate_graph_tool(i):
        graph=i.get('graph') or json.loads((root/'workflow/graph.json').read_text());errors=store.validate('urn:oneshot:schema:workflow-graph:1',graph)+validate_graph(graph);return {'valid':not errors,'errors':errors}
    def resolve_artifact_tool(i): return resolve_artifact(i.get('root') or root,i['artifact_id'])
    def trace_artifact_tool(i):
        graph=i.get('graph') or json.loads((root/'workflow/graph.json').read_text());a=i['artifact'];return {'artifact':a,'ownership':[x for x in graph.get('artifact_ownership',[]) if x.get('artifact')==a],'edges':[e for e in graph.get('edges',[]) if e.get('artifact')==a]}
    def run_fixture_tool(i):
        graph=i.get('graph') or json.loads((root/'workflow/graph.json').read_text());results,ok=run_fixture(i['fixture'],i['plan'],store,graph,i.get('assertion_ids'));return {'results':results,'valid':ok}
    reg.register('validate_schema','Validate Draft 2020-12 schema documents',validate_schema_tool)
    reg.register('validate_artifact','Validate canonical artifact and runtime parity',validate_artifact_tool)
    reg.register('validate_references','Validate cross-artifact identities',validate_refs_tool)
    reg.register('validate_parity','Prove JSON Schema/Pydantic parity',validate_parity_tool)
    reg.register('validate_registry','Validate registry digests and ownership map',validate_registry_tool)
    reg.register('validate_graph','Validate canonical workflow graph',validate_graph_tool)
    reg.register('resolve_artifact','Resolve artifact by canonical ID',resolve_artifact_tool)
    reg.register('trace_artifact','Trace artifact ownership and graph edges',trace_artifact_tool)
    reg.register('run_fixture','Execute deterministic fixture assertions',run_fixture_tool)
    reg.register('canonicalize','Canonicalize JSON using OneShot JCS',lambda i:{'canonical_utf8':canonicalize(i['value']).decode('utf-8')})
    reg.register('create_hash','Create SHA-256 from canonical confirmed core',lambda i:{'hash':create_hash(i['core'])})
    reg.register('verify_hash','Recompute and compare SHA-256',lambda i:verify_hash(i['core'],i['expected_hash']))
    return reg
