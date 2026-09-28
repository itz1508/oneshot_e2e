#!/usr/bin/env python3
"""
OneShot Source File Policy

Classifies files as source, generated, or excluded for manifest generation.
"""

import hashlib
from pathlib import Path
from typing import Dict, List, Set, Union

# Source file extensions - these are tracked in the manifest
SOURCE_EXTENSIONS: Set[str] = {
    '.ts', '.tsx', '.js', '.mjs', '.py', '.json',
    '.md', '.yml', '.yaml', '.toml', '.txt', '.css', '.html'
}

# Generated file patterns - excluded from manifest
GENERATED_PATTERNS: Set[str] = {
    'node_modules',
    'dist',
    'build',
    'out',
    '.next',
    '__pycache__',
    # Virtual environments are machine-local and are never committed. uv and pip
    # write absolute install paths into them (editable finder modules,
    # dist-info/direct_url.json, dist-info/uv_cache.json), so hashing them makes
    # the manifest verify only on the checkout that generated it and fail on
    # every fresh clone.
    '.venv',
    'venv',
    '.pytest_cache',
    '.git',
    '.gitignore',
    '.DS_Store',
    'Thumbs.db',
    '.env',
}

# Generated directory name suffixes - excluded from manifest
# uv and pip write <project>.egg-info next to the sources during an editable
# install. It is gitignored local build state, so it must never be hashed into
# the manifest or the manifest would drift on every machine that ran uv sync.
GENERATED_DIR_SUFFIXES: Set[str] = {
    '.egg-info',
}

# Excluded patterns - not for release (logs, secrets, temp)
EXCLUDED_PATTERNS: Set[str] = {
    '*.log',
    '*.tmp',
    '*.temp',
    '*.bak',
    '*.swp',
    '*~',
    'server.log',
    'server-err.log',
    'test.txt',
    'test-api.mjs',
    '.oneshot',
    '.kiro',
}

# Whitelist - files that are always source outside generated trees
WHITELIST: Set[str] = {
    'tsconfig.json',
    'package.json',
    'package-lock.json',
    'docker-compose.yml',
    'docker-compose.dev.yml',
    'manifest.json',
    'agentcore-manifest.json',
}


def is_generated_segment(segment: str) -> bool:
    """
    Check if a path segment names a generated directory or file.

    Args:
        segment: Single path segment (directory or file name)

    Returns:
        True if the segment belongs to a generated tree
    """
    if segment in GENERATED_PATTERNS:
        return True
    return any(segment.endswith(suffix) for suffix in GENERATED_DIR_SUFFIXES)


def is_source_file(path: str) -> bool:
    """
    Check if a file is a source file.
    
    Args:
        path: Relative path from repository root
        
    Returns:
        True if the file should be included in the manifest as a source file
    """
    relative_path = Path(path)
    name = relative_path.name
    ext = relative_path.suffix.lower()
    
    # Exclude manifest.json (self-referential) - BEFORE whitelist check
    if relative_path.as_posix().endswith('manifest.json'):
        return False

    # Root LICENSE file
    if relative_path.as_posix() == 'LICENSE':
        return True

    # Generated trees are never source, even when they contain a whitelisted
    # filename such as package.json.
    if any(is_generated_segment(segment) for segment in relative_path.parts):
        return False

    # Whitelist: always source outside generated trees
    if name in WHITELIST:
        return True
    
    # Not a recognized source extension
    if ext not in SOURCE_EXTENSIONS:
        return False
    
    # Check if in any generated path
    for segment in relative_path.parts:
        if is_generated_segment(segment):
            return False
    
    # Check if matches excluded patterns
    for pattern in EXCLUDED_PATTERNS:
        if pattern.startswith('*'):
            if name.endswith(pattern[1:]):
                return False
        elif pattern == name:
            return False
    
    return True


def is_generated_file(path: str) -> bool:
    """
    Check if a file is generated/compiled output.
    
    Args:
        path: Relative path from repository root
        
    Returns:
        True if the file is generated output
    """
    relative_path = Path(path)
    name = relative_path.name
    
    # Check if in generated directory
    for segment in relative_path.parts:
        if is_generated_segment(segment):
            return True

    return False


def is_excluded_file(path: str) -> bool:
    """
    Check if a file should be excluded from the repository.
    
    Args:
        path: Relative path from repository root
        
    Returns:
        True if the file should not be tracked
    """
    relative_path = Path(path)
    name = relative_path.name
    
    # Check excluded patterns
    for pattern in EXCLUDED_PATTERNS:
        if pattern.startswith('*'):
            if name.endswith(pattern[1:]):
                return True
        elif pattern == name:
            return True
    
    return False


def get_source_files(root: str = '.') -> List[str]:
    """
    Walk the repository and return all source files.
    
    Args:
        root: Root directory to scan (default: current directory)
        
    Returns:
        List of relative paths to source files, sorted alphabetically
    """
    source_files = []
    repository_root = Path(root)
    
    for source_file_path in repository_root.rglob('*'):
        # Skip directories
        if source_file_path.is_dir():
            continue
        
        # Skip hidden files (except .gitignore, .env.example)
        name = source_file_path.name
        if name.startswith('.') and name not in ('.gitignore', '.env.example'):
            continue
        
        # Get relative path
        relative_path = str(source_file_path.relative_to(repository_root))
        
        # Check if source file
        if is_source_file(relative_path):
            source_files.append(relative_path)
    
    return sorted(source_files)


def get_source_statistics(root: str = '.') -> dict:
    """
    Get statistics about source files in the repository.
    
    Args:
        root: Root directory to scan
        
    Returns:
        Dictionary with statistics
    """
    source_files = get_source_files(root)
    
    total_size = 0
    by_extension = {}
    
    for relative_path in source_files:
        try:
            file_size = (Path(root) / relative_path).stat().st_size
            total_size += file_size
            
            ext = Path(relative_path).suffix.lower() or '(no extension)'
            by_extension[ext] = by_extension.get(ext, 0) + 1
        except (OSError, IOError):
            pass
    
    return {
        'total_files': len(source_files),
        'total_size_bytes': total_size,
        'by_extension': by_extension,
    }


def compute_file_sha256(file_path: Union[str, Path]) -> str:
    """
    Compute SHA-256 hash of a file using canonical chunk-based streaming.
    
    Args:
        file_path: Path to target file
        
    Returns:
        SHA-256 hash string formatted as 'sha256:<hex>' or 'error:<msg>'
    """
    path = Path(file_path)
    sha256_hash = hashlib.sha256()
    try:
        with open(path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256_hash.update(chunk)
        return f"sha256:{sha256_hash.hexdigest()}"
    except (OSError, IOError) as e:
        return f"error:{str(e)}"


if __name__ == '__main__':
    import json
    
    print("Source File Policy Test")
    print("=" * 50)
    
    # Test some paths
    test_paths = [
        'backend/index.ts',
        'dist/backend/index.js',
        'node_modules/dotenv/dotenv.js',
        'app/env/.env',
        'README.md',
        'package.json',
        'logs/debug.log',
        'frontend/web/src/components/App.tsx',
    ]
    
    print("\nTest paths:")
    for p in test_paths:
        print(f"  {p}")
        print(f"    source: {is_source_file(p)}")
        print(f"    generated: {is_generated_file(p)}")
        print(f"    excluded: {is_excluded_file(p)}")
    
    # Get statistics
    stats = get_source_statistics()
    print("\nSource file statistics:")
    print(json.dumps(stats, indent=2))
