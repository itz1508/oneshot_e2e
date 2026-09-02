from __future__ import annotations
import argparse, os, shutil, subprocess, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

p = argparse.ArgumentParser()
p.add_argument('--skip-python', action='store_true')
p.add_argument('--with-adk', action='store_true')
p.add_argument('--with-featherless', action='store_true')
p.add_argument('--with-workspace-api', action='store_true')
a = p.parse_args()

def run(cmd):
    print('+', ' '.join(map(str, cmd)))
    subprocess.run(cmd, cwd=ROOT, check=True)

if not a.skip_python:
    run([sys.executable, '-m', 'pip', 'install', '-r', str(ROOT / 'requirements/core.txt')])
    if a.with_adk:
        run([sys.executable, '-m', 'pip', 'install', '-r', str(ROOT / 'requirements/provider-adk.txt')])
    if a.with_featherless:
        run([
            sys.executable,
            '-m',
            'pip',
            'install',
            '-r',
            str(ROOT / 'requirements/provider-featherless.txt'),
        ])
    if a.with_workspace_api:
        run([
            sys.executable,
            '-m',
            'pip',
            'install',
            '-r',
            str(ROOT / 'requirements/workspace-api.txt'),
        ])

NPM = shutil.which("npm.cmd" if os.name == "nt" else "npm")
if not NPM:
    raise RuntimeError("npm executable not found")

run([NPM, 'ci', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'])
print('ONESHOT_DEPENDENCIES_BOOTSTRAPPED')
