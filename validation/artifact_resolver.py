from __future__ import annotations
import json
from pathlib import Path

def resolve_artifact(root: str|Path, artifact_id: str):
    for p in sorted(Path(root).rglob('*.json')):
        try: data=json.loads(p.read_text(encoding='utf-8'))
        except Exception: continue
        if isinstance(data,dict) and artifact_id in data.values(): return {'path':str(p),'artifact':data}
    return None
