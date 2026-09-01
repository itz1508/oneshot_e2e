from __future__ import annotations
import subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def find_python() -> str:
    is_win = sys.platform.startswith('win')
    venv_py = ROOT / ('.venv/Scripts/python.exe' if is_win else '.venv/bin/python')
    return str(venv_py) if venv_py.exists() else sys.executable


py = find_python()


def run(cmd):
    print('+', ' '.join(map(str, cmd)))
    subprocess.run(cmd, cwd=ROOT, check=True)


run([py, 'scripts/verify_dependencies.py'])
run([py, '-m', 'unittest', 'discover', '-s', 'tests', '-v'])
compiled = sorted((ROOT / 'dist/tests_ts').glob('*.test.js'))
if not compiled:
    raise SystemExit('compiled TypeScript tests missing; run npm run build')
# Each file starts its own runtime/HTTP resources. Serial execution avoids
# Windows libuv handle-closing assertions and keeps verification memory bounded.
run(['node', '--test', '--test-concurrency=1', *map(str, compiled)])
print('ONESHOT_RUNTIME_VERIFIED')
