from __future__ import annotations
import subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def run(cmd): print('+',' '.join(map(str,cmd)));subprocess.run(cmd,cwd=ROOT,check=True)
run([sys.executable,'scripts/verify_dependencies.py'])
run([sys.executable,'-m','unittest','discover','-s','tests','-v'])
compiled=sorted((ROOT/'dist/tests_ts').glob('*.test.js'))
if not compiled:raise SystemExit('compiled TypeScript tests missing; run npm run build')
run(['node','--test','--test-force-exit',*map(str,compiled)])
print('ONESHOT_RUNTIME_VERIFIED')
