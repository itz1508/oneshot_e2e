"""Run dependency, syntax, OpenAPI, database, and HTTP workspace proofs.

Example:
    python app/workspace_api/scripts/verify.py
"""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
APP = ROOT / "app"


def run(command: list[str]) -> None:
    """Run one verification command from the repository root.

    The workspace_api package lives at app/workspace_api/. It is imported by its
    canonical Python package name ``workspace_api``, so ``app`` is placed on
    PYTHONPATH deterministically for every child process.
    """
    env = {**os.environ, "PYTHONPATH": str(APP.resolve())}
    print("+", " ".join(command))
    subprocess.run(command, cwd=ROOT, env=env, check=True)


def find_python() -> str:
    is_win = sys.platform.startswith("win")
    venv_py = ROOT / (".venv/Scripts/python.exe" if is_win else ".venv/bin/python")
    if venv_py.exists():
        return str(venv_py)
    return sys.executable


def main() -> int:
    py = find_python()
    run([py, "app/scripts/verify_dependencies.py", "--profile", "workspace"])
    run([py, "-m", "compileall", "-q", "app/workspace_api"])
    run([py, "-m", "unittest", "workspace_api.tests.test_workspace_api", "-v"])
    run(
        [
            py,
            "-c",
            (
                "from workspace_api.api import create_app; "
                "from workspace_api.config import WorkspaceSettings; "
                "app=create_app(WorkspaceSettings(environment='test',"
                "database_url='sqlite://',log_json=False)); "
                "schema=app.openapi(); "
                "assert len(schema['paths']) >= 25; "
                "assert 'ErrorResponse' in schema['components']['schemas']; "
                "print('ONESHOT_WORKSPACE_OPENAPI_VERIFIED')"
            ),
        ]
    )
    print("ONESHOT_WORKSPACE_API_VERIFIED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
