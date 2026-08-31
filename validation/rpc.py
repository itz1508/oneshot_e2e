from __future__ import annotations
import json, sys, traceback
from .cli import handle
for line in sys.stdin:
    try:
        req=json.loads(line); out=handle(req['command'],req.get('payload') or {})
        resp={'id':req['id'],'ok':True,'result':out}
    except Exception as exc:
        resp={'id':req.get('id') if 'req' in locals() else None,'ok':False,'error':str(exc),'trace':traceback.format_exc(limit=3)}
    sys.stdout.write(json.dumps(resp,separators=(',',':'))+'\n'); sys.stdout.flush()
