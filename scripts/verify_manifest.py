from __future__ import annotations
import hashlib
from pathlib import Path

try:
    from .source_file_policy import iter_source_files, source_path_is_forbidden
except ImportError:
    from source_file_policy import iter_source_files, source_path_is_forbidden

ROOT = Path(__file__).resolve().parents[1]


def verify_manifest(root: Path = ROOT, manifest_path: Path | None = None) -> list[str]:
    root = root.resolve()
    source_manifest = manifest_path or root / "MANIFEST.sha256"
    errors: list[str] = []
    listed: set[str] = set()

    for line in source_manifest.read_text(encoding="utf-8").splitlines():
        try:
            expected, rel = line.split("  ", 1)
        except ValueError:
            errors.append(f"malformed manifest entry {line}")
            continue
        listed.add(rel)
        if source_path_is_forbidden(rel):
            errors.append(f"forbidden manifest entry {rel}")
            continue
        path = root / rel
        if not path.is_file():
            errors.append(f"missing {rel}")
            continue
        actual_hash = hashlib.sha256(path.read_bytes()).hexdigest()
        if actual_hash != expected:
            errors.append(f"hash mismatch {rel}")

    actual = {
        path.relative_to(root).as_posix()
        for path in iter_source_files(root)
    }
    for rel in sorted(actual - listed):
        errors.append(f"unlisted {rel}")
    for rel in sorted(listed - actual):
        if not source_path_is_forbidden(rel):
            errors.append(f"manifest-only {rel}")
    return errors


if __name__ == "__main__":
    failures = verify_manifest()
    if failures:
        raise SystemExit("\n".join(failures))
    print("MANIFEST_VERIFIED")
