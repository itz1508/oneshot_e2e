from __future__ import annotations

import hashlib
from pathlib import Path, PurePosixPath
from typing import Iterator


EXCLUDED_DIRECTORY_NAMES = frozenset(
    {
        ".git",
        ".ollama",
        ".pytest_cache",
        ".runtime",
        ".venv",
        "__pycache__",
        "data",
        "dist",
        "node_modules",
    }
)
PRIVATE_KEY_SUFFIXES = frozenset({".pem", ".key", ".p12", ".pfx"})
PUBLIC_ENV_TEMPLATE_DIRECTORY = ("app", "env")
PUBLIC_ENV_TEMPLATE_NAMES = frozenset({".env.example", ".env.workspace.example"})
GENERATED_SOURCE_FILES = frozenset({"MANIFEST.sha256"})
IGNORED_LOCAL_FILES = frozenset(
    {
        ".DS_Store",
        # Transient test-runner output logs (.txt is a legitimate source suffix
        # in general, so these are excluded by exact name, not by suffix).
        "unit-log.txt",
        "npmci-log.txt",
        "build-log.txt",
    }
)
# Local-only scratch/runtime directories at the repository root. Root-anchored
# on purpose: "runtime" must only exclude /runtime, never legitimate nested
# source directories such as backend/runtime/.
ROOT_LEVEL_EXCLUDED_DIRECTORIES = frozenset(
    {"external", "runtime", ".headless_profile"}
)


def source_path_is_forbidden(relative_path: str | PurePosixPath) -> bool:
    path = PurePosixPath(str(relative_path).replace("\\", "/"))
    parts = tuple(part for part in path.parts if part not in {"", "."})
    if path.is_absolute() or not parts or ".." in parts:
        return True
    if parts[0] in ROOT_LEVEL_EXCLUDED_DIRECTORIES:
        return True

    lowered = tuple(part.lower() for part in parts)
    # Next.js build output and incremental compiler state are not source files.
    if lowered[:2] == ("app", "web") and len(lowered) >= 3:
        if lowered[2] in {".next", "out"} or lowered == (
            "app",
            "web",
            "tsconfig.tsbuildinfo",
        ):
            return True
    if (
        len(lowered) == 3
        and lowered[:2] == PUBLIC_ENV_TEMPLATE_DIRECTORY
        and lowered[2] in PUBLIC_ENV_TEMPLATE_NAMES
    ):
        return False

    if any(part in EXCLUDED_DIRECTORY_NAMES for part in lowered[:-1]):
        return True
    if any(
        part.startswith("credentials") or part.startswith("secrets") for part in lowered
    ):
        return True

    name = lowered[-1]
    if name == ".env" or name.startswith(".env."):
        return True
    return PurePosixPath(name).suffix.lower() in PRIVATE_KEY_SUFFIXES | {
        ".log",
        ".pid",
        ".tmp",
    }


def source_file_is_eligible(root: Path, path: Path) -> bool:
    try:
        relative = path.relative_to(root)
    except ValueError:
        return False
    if path.is_symlink() or not path.is_file():
        return False
    if path.name in GENERATED_SOURCE_FILES or path.name in IGNORED_LOCAL_FILES:
        return False
    return not source_path_is_forbidden(relative.as_posix())


def canonical_file_bytes(path: Path) -> bytes:
    """Return the canonical bytes used for manifest hashing and archives.

    Source text is LF-normalized per repository policy; CRLF is still folded
    to LF so that CRLF and LF checkouts hash identically across Windows and
    Linux. Only CRLF pairs are folded: binary assets and byte-stable legacy
    files that use lone CR bytes (no LF) are preserved byte-for-byte so
    canonicalization never corrupts them. Because ``MANIFEST.sha256`` stores
    the hash of these canonical bytes, ``sha256sum`` on a CRLF worktree file
    may differ from the manifest entry even though verification passes.
    """
    data = path.read_bytes()
    if b"\x00" in data or b"\r\n" not in data:
        return data
    return data.replace(b"\r\n", b"\n")


def canonical_sha256(path: Path) -> str:
    """Return the SHA-256 hex digest of ``canonical_file_bytes(path)``."""
    return hashlib.sha256(canonical_file_bytes(path)).hexdigest()


def iter_source_files(root: Path) -> Iterator[Path]:
    root = root.resolve()
    files = (path for path in root.rglob("*") if source_file_is_eligible(root, path))
    yield from sorted(files, key=lambda path: path.relative_to(root).as_posix())
