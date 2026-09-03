from __future__ import annotations
from typing import Any

def resolve_path(root:Any,path:str):
    cur=root
    if path in ('','$'):return cur
    p=path[2:] if path.startswith('$.') else path
    for part in p.split('.'):
        if isinstance(cur,list):cur=cur[int(part)]
        elif isinstance(cur,dict) and part in cur:cur=cur[part]
        else:raise KeyError(path)
    return cur

def run_assertion(assertion:dict,plan:dict,schema_store=None,graph=None):
    op=assertion['operator'];target=assertion['target'];expected=assertion.get('expected');exists=True
    try:actual=resolve_path(plan,target)
    except (KeyError,IndexError,ValueError):exists=False;actual=None
    if op=='exists':ok=exists
    elif op=='equals':ok=exists and actual==expected
    elif op=='contains':ok=exists and hasattr(actual,'__contains__') and expected in actual
    elif op=='references':
        ok=exists and (expected in actual if isinstance(actual,(list,tuple,set)) else actual==expected)
    elif op=='allFilesSpecified':ok=exists and isinstance(actual,list) and isinstance(expected,list) and all(x in actual for x in expected)
    elif op=='matchesSchema':
        ok=exists and schema_store is not None and isinstance(expected,str) and not schema_store.validate(expected,actual)
    elif op=='edgeExists':
        if graph is None:ok=False
        else:
            exp=expected if isinstance(expected,dict) else {};edges=graph.get('edges',[])
            ok=any(e.get('from')==exp.get('from') and e.get('to')==exp.get('to') and (exp.get('artifact') is None or e.get('artifact')==exp.get('artifact')) for e in edges);actual=ok
    else:raise ValueError(op)
    return {'assertion_id':assertion['assertion_id'],'expected':expected,'actual':actual,'satisfied':bool(ok)}

def run_fixture(fixture:dict,plan:dict,schema_store=None,graph=None,assertion_ids:list[str]|None=None):
    wanted=assertion_ids or [a['assertion_id'] for a in fixture['plan_assertions']]
    by_id={a['assertion_id']:a for a in fixture['plan_assertions']};results=[]
    for aid in wanted:
        if aid not in by_id:results.append({'assertion_id':aid,'expected':None,'actual':None,'satisfied':False})
        else:results.append(run_assertion(by_id[aid],plan,schema_store,graph))
    return results,all(r['satisfied'] for r in results)
