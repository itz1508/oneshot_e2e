"""Deterministic release/archive tooling.

Builds a byte-reproducible ZIP archive: fixed member timestamps, fixed
permissions, stable POSIX-style member ordering, deterministic compression.
File selection reuses ``source_file_policy.iter_source_files``, so archives
preserve exactly the shared sensitive-file exclusion policy used by
``generate_manifest.py`` / ``verify_manifest.py``.

Archive payload bytes match manifest canonicalization
(``canonical_file_bytes`` folds CRLF to LF; source policy keeps source text
LF-normalized, so canonical bytes normally equal worktree bytes). Binary
assets are archived byte-for-byte.

Usage: python app/scripts/build_deterministic_zip.py SRC OUT
Prints the SHA-256 of the produced archive.
"""

from __future__ import annotations
import hashlib
import sys
import zipfile
from pathlib import Path

try:
    from .source_file_policy import canonical_file_bytes, iter_source_files
except ImportError:
    from source_file_policy import canonical_file_bytes, iter_source_files

FIXED = (2020, 1, 1, 0, 0, 0)


def canonical_archive_bytes(path: Path) -> bytes:
    """Return archive payload bytes matching manifest canonicalization.

    Manifest hashes fold CRLF to LF; archives must carry those same
    canonical bytes so a deterministic ZIP is reproducible from either an
    LF or CRLF checkout. Binary assets are preserved byte-for-byte by
    ``canonical_file_bytes``.
    """
    return canonical_file_bytes(path)


def build(src: Path, out: Path):
    src = src.resolve()
    files = list(iter_source_files(src))
    with zipfile.ZipFile(
        out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9
    ) as z:
        for p in files:
            rel = f"{src.name}/{p.relative_to(src).as_posix()}"
            zi = zipfile.ZipInfo(rel, FIXED)
            zi.compress_type = zipfile.ZIP_DEFLATED
            zi.create_system = 3
            zi.external_attr = 0o100644 << 16
            z.writestr(
                zi,
                canonical_archive_bytes(p),
                compress_type=zipfile.ZIP_DEFLATED,
                compresslevel=9,
            )
    h = hashlib.sha256(out.read_bytes()).hexdigest()
    print(h)
    return h


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("usage: build_deterministic_zip.py SRC OUT")
    build(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
