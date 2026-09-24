#!/usr/bin/env python3
"""
OneShot Manifest Generator

Generates a JSON manifest of all source files with SHA-256 hashes.
"""

import argparse
import hashlib
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from source_file_policy import get_source_files, get_source_statistics


def compute_sha256(file_path: Path) -> str:
    """
    Compute SHA-256 hash of a file.
    
    Args:
        file_path: Absolute path to the file
        
    Returns:
        SHA-256 hash as hex string
    """
    sha256_hash = hashlib.sha256()
    
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256_hash.update(chunk)
        return f"sha256:{sha256_hash.hexdigest()}"
    except (OSError, IOError) as e:
        return f"error:{str(e)}"


def get_git_commit() -> str:
    """
    Get current git commit hash.
    
    Returns:
        Commit hash or 'unknown' if not available
    """
    try:
        import subprocess
        result = subprocess.run(
            ['git', 'rev-parse', 'HEAD'],
            capture_output=True,
            text=True,
            timeout=5
        )
        return result.stdout.strip()[:8] if result.returncode == 0 else 'unknown'
    except (subprocess.SubprocessError, FileNotFoundError):
        return 'unknown'


def generate_manifest(root: str = '.', output: str = 'app/manifest.json') -> dict:
    """
    Generate manifest of source files.
    
    Args:
        root: Root directory to scan
        output: Output path for manifest
        
    Returns:
        Manifest dictionary
    """
    repository_root = Path(root)
    
    print(f"Scanning source files in {root}...")
    source_files = get_source_files(root)
    print(f"Found {len(source_files)} source files")
    
    # Get statistics
    stats = get_source_statistics(root)
    
    # Get git commit
    commit = get_git_commit()
    
    # Build manifest
    files = []
    for relative_path in source_files:
        absolute_path = repository_root / relative_path
        file_hash = compute_sha256(absolute_path)
        
        try:
            file_size = absolute_path.stat().st_size
        except OSError:
            file_size = 0
        
        files.append({
            'path': relative_path,
            'size': file_size,
            'hash': file_hash,
            'category': 'source'
        })
    
    # Sort by path for deterministic output
    files.sort(key=lambda x: x['path'])
    
    # Build manifest
    manifest = {
        'generated_at': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
        'version': '1.3.0',
        'commit': commit,
        'files': files,
        'statistics': {
            'total_files': stats['total_files'],
            'source_files': stats['total_files'],
            'total_size_bytes': stats['total_size_bytes'],
            'by_extension': stats['by_extension']
        }
    }
    
    # Write manifest
    output_file_path = Path(output)
    output_file_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_file_path, 'w', encoding='utf-8') as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
    
    print(f"\nManifest written to {output}")
    print(f"  Files: {stats['total_files']}")
    print(f"  Total size: {stats['total_size_bytes']:,} bytes")
    print(f"  Commit: {commit}")
    
    return manifest


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Generate OneShot source file manifest'
    )
    parser.add_argument(
        '--root', '-r',
        default='.',
        help='Root directory to scan (default: .)'
    )
    parser.add_argument(
        '--output', '-o',
        default='app/manifest.json',
        help='Output manifest path (default: app/manifest.json)'
    )
    
    args = parser.parse_args()
    
    try:
        manifest = generate_manifest(root=args.root, output=args.output)
        
        # Print summary
        print("\nManifest generated successfully!")
        sys.exit(0)
        
    except Exception as e:
        print(f"\nError generating manifest: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
