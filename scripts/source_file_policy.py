import os
from pathlib import Path, PurePosixPath
from typing import Iterator


EXCLUDED_DIRECTORY_NAMES = frozenset(
    {
        ".git",
        ".ollama",
        ".pytest_cache",
        ".venv",
        "__pycache__",
        "data",
        "dist",
        "node_modules",
        "scratch",
    }
)
PRIVATE_KEY_SUFFIXES = frozenset({".pem", ".key", ".p12", ".pfx"})
PUBLIC_ROOT_ENV_EXAMPLES = frozenset({".env.example", ".env.workspace.example"})
GENERATED_SOURCE_FILES = frozenset({"MANIFEST.sha256"})
IGNORED_LOCAL_FILES = frozenset({".DS_Store"})


def source_path_is_forbidden(relative_path: str | PurePosixPath) -> bool:
    path = PurePosixPath(str(relative_path).replace("\\", "/"))
    parts = tuple(part for part in path.parts if part not in {"", "."})
    if path.is_absolute() or not parts or ".." in parts:
        return True

    lowered = tuple(part.lower() for part in parts)
    if len(lowered) == 1 and lowered[0] in PUBLIC_ROOT_ENV_EXAMPLES:
        return False

    if any(part in EXCLUDED_DIRECTORY_NAMES for part in lowered[:-1]):
        return True
    if any(part.startswith("credentials") or part.startswith("secrets") for part in lowered):
        return True

    name = lowered[-1]
    if name == ".env" or name.startswith(".env."):
        return True
    return PurePosixPath(name).suffix.lower() in PRIVATE_KEY_SUFFIXES


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


def iter_source_files(root: Path) -> Iterator[Path]:
    root = root.resolve()
    files: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d.lower() not in EXCLUDED_DIRECTORY_NAMES]
        for name in filenames:
            path = Path(dirpath) / name
            if source_file_is_eligible(root, path):
                files.append(path)
    yield from sorted(files, key=lambda path: path.relative_to(root).as_posix())
