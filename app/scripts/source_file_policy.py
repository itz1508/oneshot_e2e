#!/usr/bin/env python3
"""
OneShot Source File Policy

Classifies files as source, generated, or excluded for manifest generation.
"""

from pathlib import Path
from typing import List, Set

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
    '.git',
    '.gitignore',
    '.DS_Store',
    'Thumbs.db',
    '.env',
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

    # Generated trees are never source, even when they contain a whitelisted
    # filename such as package.json.
    if any(segment in GENERATED_PATTERNS for segment in relative_path.parts):
        return False

    # Whitelist: always source outside generated trees
    if name in WHITELIST:
        return True
    
    # Not a recognized source extension
    if ext not in SOURCE_EXTENSIONS:
        return False
    
    # Check if in any generated path
    for segment in relative_path.parts:
        if segment in GENERATED_PATTERNS:
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
        if segment in GENERATED_PATTERNS:
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
