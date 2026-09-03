from __future__ import annotations
import shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def run(cmd):
    print("+", " ".join(map(str, cmd)))
    is_win = sys.platform.startswith("win")
    executable = shutil.which(str(cmd[0])) if is_win else None
    if executable:
        cmd = [executable, *cmd[1:]]
    subprocess.run(cmd, cwd=ROOT, check=True, shell=is_win)


def find_python() -> str:
    is_win = sys.platform.startswith("win")
    venv_py = ROOT / (".venv/Scripts/python.exe" if is_win else ".venv/bin/python")
    if venv_py.exists():
        return str(venv_py)
    return sys.executable


py = find_python()

if not (ROOT / "node_modules/.bin/tsc").exists() and not (
    ROOT / "node_modules/typescript/bin/tsc"
):
    run(["npm", "ci", "--offline"])
run([py, "app/scripts/verify_dependencies.py", "--profile", "base"])
run([py, "-m", "unittest", "discover", "-s", "tests", "-v"])
run([py, "app/workspace_api/scripts/verify.py"])
run(["npm", "run", "build"])
compiled = sorted((ROOT / "dist/tests_ts").glob("*.test.js"))
if not compiled:
    raise SystemExit("compiled TypeScript tests missing")
run(["node", "--test", "--test-concurrency=1", "--test-force-exit", *map(str, compiled)])
print("ONESHOT_PRODUCTION_E2E_VERIFIED")
