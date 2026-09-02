from __future__ import annotations
import argparse, json, os, re, sys
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
REQUIREMENTS_DIR = ROOT / "requirements"


def requirement_files(provider: str | None = None) -> list[Path]:
    files = [REQUIREMENTS_DIR / "core.txt"]
    selected = (
        provider
        if provider is not None
        else os.getenv("ONESHOT_RESEARCH_PROVIDER", "")
    ).lower()
    if selected in {"adk_gemma2", "google_adk_gemma2", "provider-adk", "adk"}:
        files.append(REQUIREMENTS_DIR / "provider-adk.txt")
    if selected in {"featherless", "featherless_gemma4", "provider-featherless"}:
        files.append(REQUIREMENTS_DIR / "provider-featherless.txt")
    if os.getenv("ONESHOT_WORKSPACE_API", "").lower() == "true":
        files.append(REQUIREMENTS_DIR / "workspace-api.txt")
    return files


def verify_requirement_files(
    files: list[Path], version_lookup=version
) -> list[str]:
    errors = []
    for path in files:
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "==" not in line:
                errors.append(f"{path.name}: unpinned requirement {line}")
                continue
            name, want = line.split("==", 1)
            try:
                got = version_lookup(name)
            except Exception as error:
                errors.append(f"{name}: missing ({error})")
                continue
            if got != want:
                errors.append(f"{name}: {got} != {want}")
    return errors


def verify_node_lock() -> list[str]:
    errors = []
    lock = json.loads((ROOT / "package-lock.json").read_text(encoding="utf-8"))
    deps = lock["packages"][""].get("devDependencies", {})
    for name in ("@types/node", "typescript", "undici-types"):
        if name not in deps:
            errors.append(f"node lock missing {name}")
    return errors


def pins(path: Path, check_installed: bool) -> list[str]:
    errors = []
    if not path.exists():
        errors.append(f"{path.name}: file does not exist")
        return errors
    for raw in path.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        if "==" not in line:
            errors.append(f"{path.name}: unpinned requirement {line}")
            continue
        name, want = line.split("==", 1)
        if not re.fullmatch(r"[A-Za-z0-9_.-]+", name) or not want:
            errors.append(f"{path.name}: invalid pin {line}")
            continue
        if check_installed:
            try:
                got = version(name)
            except Exception as e:
                errors.append(f"{name}: missing ({e})")
                continue
            if got != want:
                errors.append(f"{name}: {got} != {want}")
    return errors


def verify_pyproject_authority() -> list[str]:
    errors = []
    pyproject_path = ROOT / "pyproject.toml"
    if not pyproject_path.exists():
        errors.append("pyproject.toml: missing authoritative project file")
        return errors
    content = pyproject_path.read_text(encoding="utf-8")
    for req_file in ["core.txt", "provider-adk.txt", "provider-featherless.txt", "workspace-api.txt"]:
        p = REQUIREMENTS_DIR / req_file
        if not p.exists():
            errors.append(f"requirements/{req_file}: missing pinned profile file")
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if f'"{line}"' not in content:
                errors.append(f"pyproject.toml: missing exact declaration for {line}")
    return errors


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profile",
        choices=("base", "core", "adk", "featherless", "workspace", "all"),
        default="base",
    )
    args = parser.parse_args(argv)

    errors = []
    errors.extend(verify_pyproject_authority())
    if args.profile in ("base", "core", "all"):
        errors.extend(pins(REQUIREMENTS_DIR / "core.txt", True))
    if args.profile in ("adk", "all"):
        errors.extend(pins(REQUIREMENTS_DIR / "provider-adk.txt", True))
    if args.profile in ("featherless", "all"):
        errors.extend(pins(REQUIREMENTS_DIR / "provider-featherless.txt", True))
    if args.profile in ("workspace", "all"):
        errors.extend(pins(REQUIREMENTS_DIR / "workspace-api.txt", True))
    errors.extend(verify_node_lock())

    if errors:
        print("\n".join(errors))
        return 1
    print(f"ONESHOT_DEPENDENCIES_PINNED profile={args.profile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
