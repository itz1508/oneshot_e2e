from __future__ import annotations
import importlib,json,os,queue,re,subprocess,sys,threading,time,urllib.request
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
BASE=os.getenv('OLLAMA_API_BASE','http://localhost:11434').rstrip('/')
MODEL=os.getenv('GEMMA2_LOCAL_MODEL','gemma2:9b')

def find_python() -> str:
    is_win = sys.platform.startswith("win")
    venv_py = ROOT / (".venv/Scripts/python.exe" if is_win else ".venv/bin/python")
    return str(venv_py) if venv_py.exists() else sys.executable

py = find_python()
if Path(sys.executable).resolve() != Path(py).resolve():
    r = subprocess.run([py, *sys.argv], cwd=ROOT)
    sys.exit(r.returncode)

def request_json(url:str,method='GET',body=None,timeout=10):
    data=None if body is None else json.dumps(body).encode('utf-8')
    request=urllib.request.Request(url,data=data,method=method,headers={'content-type':'application/json'} if data else {})
    with urllib.request.urlopen(request,timeout=timeout) as response:return json.loads(response.read().decode('utf-8'))

def preflight():
    issues=[]
    for module in ('google.adk','litellm','redis'):
        try:importlib.import_module(module)
        except Exception as error:issues.append(f'{module}: {type(error).__name__}: {error}')
    try:models=[model.get('name','') for model in request_json(BASE+'/api/tags').get('models',[])]
    except Exception as error:issues.append(f'Ollama: {error}');models=[]
    if MODEL not in models:issues.append(f'model missing: {MODEL}')
    if issues:raise RuntimeError('; '.join(issues))
    return models

def start_server(environment:dict[str,str]):
    process=subprocess.Popen(['node','dist/backend/index.js'],cwd=ROOT,env=environment,text=True,stdout=subprocess.PIPE,stderr=subprocess.STDOUT)
    lines:queue.Queue[str]=queue.Queue()
    def reader():
        assert process.stdout
        for line in process.stdout:lines.put(line.rstrip())
    threading.Thread(target=reader,daemon=True).start();deadline=time.monotonic()+30;captured=[]
    while time.monotonic()<deadline:
        if process.poll() is not None:raise RuntimeError(f'OneShot server exited before readiness: {captured}')
        try:line=lines.get(timeout=.25)
        except queue.Empty:continue
        captured.append(line);match=re.search(r'ONESHOT_SERVER_READY port=(\d+)',line)
        if match:return process,int(match.group(1)),captured
    raise TimeoutError(f'OneShot server readiness exceeded 30s: {captured}')

def verify_chain():
    environment={**os.environ,'PORT':'0','ONESHOT_MODE':'production','ONESHOT_RESEARCH_PROVIDER':'adk_gemma2','ONESHOT_PYTHON':find_python(),'GEMMA2_LOCAL_MODEL':MODEL,'OLLAMA_API_BASE':BASE,'GEMMA2_AUTO_PULL':'false','API_RATE_LIMIT_MAX':'10000'}
    environment.pop('ONESHOT_ADK_TEST_DRAFT_FILE',None);environment.pop('ONESHOT_ADK_TEST_DELAY_SECONDS',None)
    process=None
    try:
        process,port,logs=start_server(environment);base=f'http://127.0.0.1:{port}'
        started=request_json(base+'/api/runs','POST',{'intent':'Create a two-step local product plan with an implementation dependency and deterministic proof.','requested_outcome':'The researched plan preserves evidence, dependency order, job-specific validation, and reaches DONE.'})
        deadline=time.monotonic()+int(environment.get('GEMMA2_TIMEOUT_SECONDS','300'))+60;snapshot={}
        while time.monotonic()<deadline:
            snapshot=request_json(f"{base}/api/runs/{started['run_id']}")
            if snapshot.get('result'):break
            time.sleep(1)
        if snapshot.get('result')!='PASSED':raise RuntimeError(f"live chain did not pass: {json.dumps(snapshot,ensure_ascii=False)}")
        if not snapshot.get('hash_proof',{}).get('equal'):raise RuntimeError('live chain hash equality is false')
        artifacts=snapshot.get('artifacts',{});triple=json.loads(Path(artifacts['triple-validation']).read_text(encoding='utf-8'));researcher=json.loads(Path(artifacts['researcher']).read_text(encoding='utf-8'));plan=json.loads(Path(artifacts['plan.gap']).read_text(encoding='utf-8'));fixture=json.loads(Path(artifacts['fixture']).read_text(encoding='utf-8'))
        results=[triple[name]['result'] for name in ('schema_validation','fixture_validation','goal_validation')]
        if results!=['VALID','VALID','VALID']:raise RuntimeError(f'live triple validation failed: {results}')
        if not researcher['evidence'] or not all(item['provenance'].startswith('oneshot://prompt/') for item in researcher['evidence']):raise RuntimeError('live evidence provenance is not resolvable to the durable prompt')
        if not plan['dependencies'] or not any(step['depends_on'] for step in plan['steps'][1:]):raise RuntimeError('live draft did not preserve requirement dependencies and step execution edges')
        if len(fixture['plan_assertions'])<=1:raise RuntimeError('live fixture is not job-specific')
        return {'result':'PASSED','provider_path':'Google ADK -> LiteLLM -> Ollama','model':MODEL,'ollama':BASE,'run_id':started['run_id'],'schema':'VALID','fixture':'VALID','goal':'VALID','hash_equal':True,'done':'PASSED','evidence_records':len(researcher['evidence']),'fixture_assertions':len(fixture['plan_assertions'])}
    finally:
        if process is not None:
            process.terminate()
            try:process.wait(timeout=10)
            except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)

def main():
    try:
        models=preflight();result=verify_chain();result['available_models']=models;print(json.dumps(result,indent=2));return 0
    except Exception as error:
        print(json.dumps({'result':'ROOT CAUSE','issue':f'{type(error).__name__}: {error}','ollama':BASE,'model':MODEL},indent=2));return 1

if __name__=='__main__':raise SystemExit(main())
