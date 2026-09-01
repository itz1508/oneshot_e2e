from __future__ import annotations
import hashlib
from pathlib import Path

try:
    from .source_file_policy import iter_source_files
except ImportError:
    from source_file_policy import iter_source_files

ROOT = Path(__file__).resolve().parents[1]


def generate_manifest(root: Path = ROOT, manifest_path: Path | None = None) -> int:
    root = root.resolve()
    destination = manifest_path or root / "MANIFEST.sha256"
    lines = [
        f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(root).as_posix()}"
        for path in iter_source_files(root)
    ]
    destination.write_text("\n".join(lines) + "\n", encoding="utf-8", newline="\n")
    return len(lines)


if __name__ == "__main__":
    print(f"MANIFEST_GENERATED entries={generate_manifest()}")
