from __future__ import annotations
import argparse, json, os, re, sys
from importlib.metadata import version
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]


def requirement_files(provider: str | None = None) -> list[Path]:
    files = [ROOT / "app/requirements" / "base.txt"]
    selected = (
        provider
        if provider is not None
        else os.getenv("ONESHOT_RESEARCH_PROVIDER", "")
    ).lower()
    if selected in {"adk_gemma2", "google_adk_gemma2"}:
        files.append(ROOT / "app/requirements" / "adk.txt")
    if selected in {"featherless", "featherless_gemma4"}:
        files.append(ROOT / "app/requirements" / "featherless.txt")
    if os.getenv("ONESHOT_WORKSPACE_API", "").lower() == "true":
        files.append(ROOT / "app/requirements" / "workspace-api.txt")
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
    # Runtime modules required by the BullMQ run-queue integration.
    installed = lock.get("packages", {})
    for name in ("bullmq", "ioredis"):
        if f"node_modules/{name}" not in installed:
            errors.append(f"node lock missing runtime module {name}")
    return errors


def pins(path: Path, check_installed: bool) -> list[str]:
    errors = []
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


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--profile",
        choices=("base", "adk", "featherless", "workspace", "all"),
        default="base",
    )
    args = parser.parse_args(argv)

    errors = []
    if args.profile in ("base", "all"):
        errors.extend(pins(ROOT / "app/requirements" / "base.txt", True))
    if args.profile in ("adk", "all"):
        errors.extend(pins(ROOT / "app/requirements" / "adk.txt", True))
    if args.profile in ("featherless", "all"):
        errors.extend(pins(ROOT / "app/requirements" / "featherless.txt", True))
    if args.profile in ("workspace", "all"):
        errors.extend(pins(ROOT / "app/requirements" / "workspace-api.txt", True))
    errors.extend(verify_node_lock())

    if errors:
        print("\n".join(errors))
        return 1
    print(f"ONESHOT_DEPENDENCIES_PINNED profile={args.profile}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
