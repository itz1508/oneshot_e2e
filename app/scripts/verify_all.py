#!/usr/bin/env python3
"""
OneShot Verification Suite

Runs all verification checks: environment, dependencies, build outputs,
configuration, manifest, tests, and security.
"""

import os
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
    parts = version.lstrip('v').split('.')
    return tuple(int(part) for part in parts[:3])


def check_environment() -> bool:
    """Check environment requirements."""
    print_section("1. Environment")

    passed = True
    node_minimum = (24, 21, 0)
    pnpm_minimum = (11, 27, 1)
    node_required = '>=24.21.0'
    pnpm_required = '>=11.27.1'
    
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
    
    # Check Python
    try:
        result = subprocess.run(['python', '--version'], capture_output=True, text=True, timeout=5)
        version = result.stdout.strip()
        print_check("Python", True, version)
    except FileNotFoundError:
        print_check("Python", False, "not found")
        passed = False
    except Exception as e:
        print_check("Python", False, str(e))
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
        print_check("backend/tests/ts", True, "not found (tests may be elsewhere)")
    
    # Check frontend tests
    frontend_tests = repository_root / 'frontend/web/tests'
    if frontend_tests.exists():
        frontend_test_files = list(frontend_tests.glob('*.test.mjs'))
        print_check("frontend/web/tests", True, f"{len(frontend_test_files)} test files")
    else:
        print_check("frontend/web/tests", True, "not found")
    
    # Check e2e tests
    e2e_tests = repository_root / 'e2e'
    if e2e_tests.exists() and any(e2e_tests.glob('*.spec.ts')):
        print_check("e2e tests", True, "found")
    else:
        print_check("e2e tests", True, "not found")
    
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
    
    source_file_paths = list(repository_root.glob('**/*.ts'))
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
