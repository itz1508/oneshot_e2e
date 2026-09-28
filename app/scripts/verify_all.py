#!/usr/bin/env python3
"""
OneShot Verification Suite

Runs all verification checks: environment, dependencies, build outputs,
configuration, manifest, tests, and security.
"""

import os
import re
import shutil
import subprocess
import sys
from pathlib import Path

# Colors for output - Windows compatible
import os
if os.name == 'nt':
    # Windows - configure UTF-8 output if possible, else ASCII symbols
    try:
        if hasattr(sys.stdout, 'reconfigure'):
            sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        if hasattr(sys.stderr, 'reconfigure'):
            sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
    RED = ''
    GREEN = ''
    YELLOW = ''
    BLUE = ''
    RESET = ''
else:
    # Unix - use ANSI codes
    RED = '\033[91m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    BLUE = '\033[94m'
    RESET = '\033[0m'


def print_header():
    """Print header."""
    print()
    print("=" * 70)
    print("  OneShot Verification Suite")
    print("=" * 70)
    print()


def print_section(name: str):
    """Print section header."""
    print(f"\n{name}")
    print("-" * len(name))


def print_check(name: str, passed: bool, details: str = ''):
    """Print check result."""
    symbol = f"{GREEN}✓{RESET}" if passed else f"{RED}✗{RESET}"
    print(f"  [{symbol}] {name}")
    if details:
        if passed:
            print(f"       {BLUE}{details}{RESET}")
        else:
            print(f"       {YELLOW}WARNING: {details}{RESET}")


def parse_version(version: str) -> tuple[int, int, int]:
    """Parse a semantic version into a comparable tuple."""
    import re
    match = re.search(r'(\d+)\.(\d+)(?:\.(\d+))?', version)
    if not match:
        raise ValueError(f"Unable to parse version from: {version!r}")
    major = int(match.group(1))
    minor = int(match.group(2))
    patch = int(match.group(3)) if match.group(3) is not None else 0
    return (major, minor, patch)


def check_environment() -> bool:
    """Check environment requirements."""
    print_section("1. Environment")

    passed = True
    node_minimum = (24, 21, 0)
    pnpm_minimum = (11, 27, 1)
    python_minimum = (3, 12, 0)
    node_required = '>=24.21.0'
    pnpm_required = '>=11.27.1'
    python_required = '>=3.12.0'
    
    # Check Node.js
    try:
        result = subprocess.run(['node', '--version'], capture_output=True, text=True, timeout=5)
        version = result.stdout.strip()
        if parse_version(version) >= node_minimum:
            print_check("Node.js", True, f"{version} (required: {node_required})")
        else:
            print_check("Node.js", False, f"{version} (required: {node_required})")
            passed = False
    except FileNotFoundError:
        print_check("Node.js", False, "not found")
        passed = False
    except Exception as e:
        print_check("Node.js", False, str(e))
        passed = False
    
    # Check pnpm
    pnpm_command = shutil.which('pnpm') or shutil.which('pnpm.cmd')
    if not pnpm_command:
        print_check("pnpm", False, f"not found; enable Corepack or install pnpm {pnpm_required}")
        passed = False
    else:
        try:
            result = subprocess.run([pnpm_command, '--version'], capture_output=True, text=True, timeout=5)
            version = result.stdout.strip()
            if parse_version(version) >= pnpm_minimum:
                print_check("pnpm", True, f"{version} (required: {pnpm_required})")
            else:
                print_check("pnpm", False, f"{version} (required: {pnpm_required})")
                passed = False
        except Exception as e:
            print_check("pnpm", False, str(e))
            passed = False
    
    # Check Python (>=3.12, single authority with backend/python/pyproject.toml)
    python_command = shutil.which('python') or shutil.which('python3')
    if not python_command:
        print_check('Python', False, 'not found')
        passed = False
    else:
        try:
            result = subprocess.run([python_command, '--version'], capture_output=True, text=True, timeout=5)
            version = (result.stdout or result.stderr).strip()
            if parse_version(version) >= python_minimum:
                print_check('Python', True, f'{version} (required: {python_required})')
            else:
                print_check('Python', False, f'{version} (required: {python_required})')
                passed = False
        except Exception as e:
            print_check('Python', False, str(e))
            passed = False
    # Check uv (owns backend/python/.venv via `uv sync --frozen`)
    uv_command = shutil.which('uv') or shutil.which('uv.exe')
    if not uv_command:
        print_check('uv', False, 'not found; install uv to manage backend/python')
        passed = False
    else:
        try:
            result = subprocess.run([uv_command, '--version'], capture_output=True, text=True, timeout=5)
            version = (result.stdout or result.stderr).strip()
            print_check('uv', True, version)
        except Exception as e:
            print_check('uv', False, str(e))
            passed = False
    
    return passed


def check_dependencies() -> bool:
    """Check required dependencies."""
    print_section("2. Dependencies")
    
    passed = True
    repository_root = Path('.')
    
    # Check node_modules
    node_modules = repository_root / 'node_modules'
    if node_modules.exists():
        print_check("node_modules", True, "exists")
    else:
        print_check("node_modules", False, "not found")
        passed = False
    
    # Check critical packages
    # Root packages
    root_critical_packages = [
        '@strands-agents/sdk',
        'dotenv',
        'openai',
        'ai',
    ]
    
    # Dev packages at root
    dev_packages = [
        '@playwright/test',
    ]
    
    # Frontend packages
    frontend_critical_packages = [
        'next',
    ]
    
    critical_packages = root_critical_packages
    
    package_json = repository_root / 'package.json'
    if package_json.exists():
        import json
        with open(package_json, 'r') as f:
            data = json.load(f)
            deps = data.get('dependencies', {})
            dev_deps = data.get('devDependencies', {})
        
        for pkg in critical_packages:
            if pkg in deps:
                print_check(pkg, True, f"{deps[pkg]}")
            else:
                print_check(pkg, False, "not found")
                passed = False
        
        # Check dev dependencies at root
        for pkg in dev_packages:
            if pkg in dev_deps:
                print_check(pkg, True, dev_deps[pkg])
            else:
                print_check(pkg, False, "not found")
                passed = False
        
        # Check frontend dependencies
        frontend_package_json = repository_root / 'frontend/web/package.json'
        if frontend_package_json.exists():
            with open(frontend_package_json, 'r') as f:
                frontend_deps = json.load(f).get('dependencies', {})
            
            for pkg in frontend_critical_packages:
                if pkg in frontend_deps:
                    print_check(f'frontend/{pkg}', True, frontend_deps[pkg])
                else:
                    print_check(f'frontend/{pkg}', False, "not found")
                    passed = False
        else:
            print_check("frontend/web/package.json", False, "not found")
            passed = False
    else:
        print_check("package.json", False, "not found")
        passed = False
    # Check Python service env (uv authority: pyproject.toml -> uv.lock -> .venv)
    python_dir = repository_root / 'backend' / 'python'
    venv_python = (
        python_dir / '.venv' / 'Scripts' / 'python.exe'
        if os.name == 'nt'
        else python_dir / '.venv' / 'bin' / 'python'
    )
    uv_command = shutil.which('uv') or shutil.which('uv.exe')
    if not (python_dir / 'pyproject.toml').exists():
        print_check('backend/python/pyproject.toml', False, 'missing')
        passed = False
    elif not (python_dir / 'uv.lock').exists():
        print_check('backend/python/uv.lock', False, 'missing; run uv lock in backend/python')
        passed = False
    elif not uv_command:
        print_check('uv lock sync', False, 'uv not found')
        passed = False
    else:
        try:
            lock_check = subprocess.run(
                [uv_command, 'lock', '--check'],
                capture_output=True, text=True, timeout=60, cwd=str(python_dir),
            )
            if lock_check.returncode == 0:
                print_check('uv lock sync', True, 'uv.lock matches pyproject.toml')
            else:
                print_check('uv lock sync', False, 'uv.lock out of sync; run node scripts/setup-python.mjs')
                passed = False
        except Exception as e:
            print_check('uv lock sync', False, str(e))
            passed = False
    # Generated pip fallback must stay an installable export of uv.lock
    requirements_file = python_dir / 'requirements.txt'
    if not requirements_file.exists():
        print_check(
            'python requirements.txt',
            False,
            'missing; run node scripts/setup-python.mjs --export-requirements',
        )
        passed = False
    else:
        try:
            pinned = {}
            invalid = []
            for raw_line in requirements_file.read_text(encoding='utf-8').splitlines():
                line = raw_line.split('#', 1)[0].strip()
                if not line:
                    continue
                requirement = line.split(';', 1)[0].strip()
                match = re.fullmatch(r'([A-Za-z0-9._-]+)==([^\s=<>!~]+)', requirement)
                if match:
                    pinned[match.group(1).lower()] = match.group(2)
                else:
                    invalid.append(requirement)

            locked = {}
            if (python_dir / 'uv.lock').exists():
                lock_text = (python_dir / 'uv.lock').read_text(encoding='utf-8')
                for name, version in re.findall(r'^name = "([^"]+)"\nversion = "([^"]+)"', lock_text, re.MULTILINE):
                    locked.setdefault(name.lower(), set()).add(version)

            drift = sorted(
                f'{name}=={version}'
                for name, version in pinned.items()
                if version not in locked.get(name, set())
            )
            if invalid:
                print_check(
                    'python requirements.txt',
                    False,
                    f'not pip-installable from repo root: {", ".join(invalid[:3])}',
                )
                passed = False
            elif drift:
                print_check(
                    'python requirements.txt',
                    False,
                    f'not in sync with uv.lock: {", ".join(drift[:3])}',
                )
                passed = False
            else:
                print_check('python requirements.txt', True, f'{len(pinned)} pinned exports match uv.lock')
        except Exception as e:
            print_check('python requirements.txt', False, str(e))
            passed = False
    if not venv_python.exists():
        print_check('python venv', False, 'missing interpreter; run node scripts/setup-python.mjs')
        passed = False
    else:
        try:
            import_check = subprocess.run(
                [str(venv_python), '-c', 'import fastapi, pydantic, uvicorn; print("deps-ok")'],
                capture_output=True, text=True, timeout=60,
            )
            if import_check.returncode == 0 and 'deps-ok' in import_check.stdout:
                print_check('python venv imports', True, 'fastapi/pydantic/uvicorn')
            else:
                print_check('python venv imports', False, (import_check.stderr or 'import failed').strip()[-200:])
                passed = False
        except Exception as e:
            print_check('python venv imports', False, str(e))
            passed = False
        try:
            health_check = subprocess.run(
                [str(venv_python), '-c', (
                    'from fastapi.testclient import TestClient; '
                    'from app.main import app; '
                    "response = TestClient(app).get('/health'); "
                    'assert response.status_code == 200, response.status_code; '
                    'body = response.json(); '
                    "assert body['status'] == 'ok', body; "
                    "assert body['service'] == 'oneshot-python-reasoner', body; "
                    "print('health-ok')"
                )],
                capture_output=True, text=True, timeout=60, cwd=str(python_dir),
            )
            if health_check.returncode == 0 and 'health-ok' in health_check.stdout:
                print_check('python /health contract', True, 'GET /health 200 status=ok')
            else:
                print_check('python /health contract', False, (health_check.stderr or 'no health-ok').strip()[-200:])
                passed = False
        except Exception as e:
            print_check('python /health contract', False, str(e))
            passed = False
        if uv_command:
            for tool_args, tool_name in (
                (['check', '.'], 'ruff check'),
                (['format', '--check', '.'], 'ruff format check'),
            ):
                try:
                    tool_check = subprocess.run(
                        [uv_command, 'run', '--frozen', '--group', 'dev', 'ruff'] + tool_args,
                        capture_output=True, text=True, timeout=120, cwd=str(python_dir),
                    )
                    if tool_check.returncode == 0:
                        print_check(tool_name, True, 'clean')
                    else:
                        detail = (tool_check.stdout or tool_check.stderr).strip()[-200:]
                        print_check(tool_name, False, detail)
                        passed = False
                except Exception as e:
                    print_check(tool_name, False, str(e))
                    passed = False
            try:
                pytest_check = subprocess.run(
                    [uv_command, 'run', '--frozen', '--group', 'dev', 'pytest', '-q'],
                    capture_output=True, text=True, timeout=180, cwd=str(python_dir),
                )
                if pytest_check.returncode == 0:
                    print_check('python pytest', True, pytest_check.stdout.strip().splitlines()[-1][:120])
                else:
                    detail = (pytest_check.stdout or pytest_check.stderr).strip()[-300:]
                    print_check('python pytest', False, detail)
                    passed = False
            except Exception as e:
                print_check('python pytest', False, str(e))
                passed = False
    
    return passed


def check_build_outputs() -> bool:
    """Check build outputs exist."""
    print_section("3. Build Outputs")
    
    passed = True
    
    # Check backend
    backend_js = Path('dist/backend/index.js')
    if backend_js.exists():
        print_check("dist/backend/index.js", True, "exists")
    else:
        print_check("dist/backend/index.js", False, "not found (run: pnpm run build:backend)")
        passed = False
    
    # Check frontend
    frontend_dist = Path('frontend/web/dist')
    if frontend_dist.exists():
        print_check("frontend/web/dist", True, "exists")
    else:
        print_check("frontend/web/dist", False, "not found (run: pnpm run build:ui)")
        passed = False
    
    return passed


def check_configuration() -> bool:
    """Check configuration files."""
    print_section("4. Configuration")
    
    passed = True
    
    configs = [
        ('tsconfig.json', 'TypeScript config'),
        ('package.json', 'Package manifest'),
        ('app/env/.env.example', 'Environment template'),
        ('.gitignore', 'Git ignore rules'),
    ]
    
    for path, desc in configs:
        p = Path(path)
        if p.exists():
            print_check(path, True, desc)
        else:
            print_check(path, False, f"{desc} - not found")
            passed = False
    
    return passed


def check_manifest() -> bool:
    """Check manifest integrity."""
    print_section("5. Manifest")
    
    manifest_path = Path('app/manifest.json')
    
    if not manifest_path.exists():
        print_check("app/manifest.json", False, "not found (run: python app/scripts/generate_manifest.py)")
        return False
    
    # Try to verify manifest
    try:
        result = subprocess.run(
            ['python', 'app/scripts/verify_manifest.py'],
            capture_output=True,
            text=True,
            timeout=30
        )
        
        if result.returncode == 0:
            print_check("Manifest verification", True, "matches repository")
            return True
        else:
            print_check("Manifest verification", False, "mismatch detected")
            # Show summary
            for line in result.stdout.split('\n'):
                if 'Result:' in line or 'MISMATCH' in line or 'Unchanged:' in line:
                    print(f"       {line.strip()}")
            return False
    except Exception as e:
        print_check("Manifest verification", False, str(e))
        return False


def check_tests() -> bool:
    """Check test infrastructure."""
    print_section("6. Tests")
    
    passed = True
    repository_root = Path('.')
    
    # Check backend tests
    backend_tests = repository_root / 'backend/tests/ts'
    if backend_tests.exists():
        backend_test_files = list(backend_tests.glob('*.test.ts'))
        print_check("backend/tests/ts", True, f"{len(backend_test_files)} test files")
    else:
        print_check("backend/tests/ts", False, "not found")
        passed = False
    # Check Python tests (uv authority: backend/python/tests/test_*.py)
    python_tests = repository_root / 'backend' / 'python' / 'tests'
    python_test_files = sorted(python_tests.glob('test_*.py')) if python_tests.exists() else []
    if python_test_files:
        print_check('backend/python/tests', True, f'{len(python_test_files)} test files')
    else:
        print_check('backend/python/tests', False, 'no test_*.py found')
        passed = False
    
    # Check frontend tests
    frontend_tests = repository_root / 'frontend/web/tests'
    if frontend_tests.exists():
        frontend_test_files = list(frontend_tests.glob('*.test.mjs'))
        print_check("frontend/web/tests", True, f"{len(frontend_test_files)} test files")
    else:
        print_check("frontend/web/tests", False, "not found")
        passed = False
    
    # Check e2e tests
    e2e_tests = repository_root / 'e2e'
    if e2e_tests.exists() and any(e2e_tests.glob('*.spec.ts')):
        print_check("e2e tests", True, "found")
    else:
        print_check("e2e tests", False, "not found")
        passed = False
    
    return passed


def check_security() -> bool:
    """Check security requirements."""
    print_section("7. Security")
    
    passed = True
    repository_root = Path('.')
    
    # Check .env is not in git
    gitignore = repository_root / '.gitignore'
    if gitignore.exists():
        content = gitignore.read_text()
        if '.env' in content or 'app/env/.env' in content:
            print_check(".env git protection", True, ".env is in .gitignore")
        else:
            print_check(".env git protection", False, ".env not in .gitignore")
            passed = False
    else:
        print_check(".gitignore", False, "not found")
        passed = False
    
    # Check no hardcoded secrets in source
    import re
    secret_patterns = [
        (r'AIzaSy[a-zA-Z0-9_]{35}', 'Google API key pattern'),
        (r'sk-[a-zA-Z0-9]{48,}', 'OpenAI API key pattern'),
    ]
    
    source_file_paths = [
        p for p in repository_root.glob('**/*.ts')
        if not any(part in ('node_modules', '.next', 'dist', '.git', 'coverage') for part in p.parts)
    ]
    secrets_found = []
    
    for source_file_path in source_file_paths:
        try:
            content = source_file_path.read_text()
            for pattern, name in secret_patterns:
                if re.search(pattern, content):
                    secrets_found.append((str(source_file_path), name))
        except:
            pass
    
    if secrets_found:
        print_check("No hardcoded secrets", False, f"found {len(secrets_found)} potential secrets")
        passed = False
    else:
        print_check("No hardcoded secrets", True, "no obvious secrets found")
    
    return passed


def main():
    """Main entry point."""
    print_header()
    
    results = {}
    
    # Run checks
    results['environment'] = check_environment()
    results['dependencies'] = check_dependencies()
    results['build_outputs'] = check_build_outputs()
    results['configuration'] = check_configuration()
    results['manifest'] = check_manifest()
    results['tests'] = check_tests()
    results['security'] = check_security()
    
    # Summary
    print()
    print("=" * 70)
    print("Summary")
    print("=" * 70)
    print()
    
    passed_count = sum(1 for v in results.values() if v)
    total_count = len(results)
    
    for name, passed in results.items():
        symbol = f"{GREEN}✓{RESET}" if passed else f"{RED}✗{RESET}"
        print(f"  [{symbol}] {name}")
    
    print()
    print(f"Passed: {passed_count}/{total_count}")
    print()
    
    if passed_count == total_count:
        print(f"{GREEN}All checks passed!{RESET}")
        sys.exit(0)
    else:
        print(f"{YELLOW}Some checks failed.{RESET}")
        print()
        print("Run the failing checks manually for details.")
        sys.exit(1)


if __name__ == '__main__':
    main()
