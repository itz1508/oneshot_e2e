from __future__ import annotations
import json,os,sys,urllib.request
base=os.getenv('OLLAMA_API_BASE','http://localhost:11434').rstrip('/');model=os.getenv('GEMMA2_LOCAL_MODEL','gemma2:9b')
try:
    with urllib.request.urlopen(base+'/api/tags',timeout=5) as r:data=json.loads(r.read().decode())
except Exception as e:raise SystemExit(f'ROOT CAUSE: Ollama unavailable at {base}: {e}')
names=[m.get('name','') for m in data.get('models',[])]
if model not in names:raise SystemExit(f'ROOT CAUSE: {model} missing; run: ollama pull {model}')
print(json.dumps({'result':'PASSED','ollama':base,'model':model,'available_models':names},indent=2))
