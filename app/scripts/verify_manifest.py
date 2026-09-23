#!/usr/bin/env python3
"""
OneShot Manifest Verifier

Verifies manifest integrity by comparing with current repository state.
"""

import argparse
import json
import sys
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from source_file_policy import get_source_files, is_source_file


def load_manifest(manifest_path: str) -> dict:
    """Load and parse manifest file."""
    with open(manifest_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def compute_file_hash(file_path: Path) -> str:
    """Compute SHA-256 hash of a file."""
    import hashlib
    sha256_hash = hashlib.sha256()
    
    try:
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(8192), b''):
                sha256_hash.update(chunk)
        return f"sha256:{sha256_hash.hexdigest()}"
    except (OSError, IOError):
        return None


def verify_manifest(manifest_path: str, root: str = '.') -> bool:
    """
    Verify manifest against current repository state.
    
    Args:
        manifest_path: Path to manifest.json
        root: Root directory to scan
        
    Returns:
        True if manifest matches, False if differences found
    """
    root_path = Path(root)
    
    # Load manifest
    print(f"Loading manifest: {manifest_path}")
    try:
        manifest = load_manifest(manifest_path)
    except FileNotFoundError:
        print(f"ERROR: Manifest not found at {manifest_path}")
        return False
    except json.JSONDecodeError as e:
        print(f"ERROR: Invalid JSON in manifest: {e}")
        return False
    
    print(f"Manifest: {manifest.get('version', 'unknown')} (commit: {manifest.get('commit', 'unknown')})")
    print(f"Manifest files: {manifest.get('statistics', {}).get('total_files', 0)}")
    print()
    
    # Get current source files
    print("Scanning current repository...")
    current_files = get_source_files(root)
    print(f"Found {len(current_files)} source files")
    print()
    
    # Build manifest hash lookup
    manifest_hashes = {}
    for f in manifest.get('files', []):
        path = f.get('path')
        hash_val = f.get('hash')
        if path:
            manifest_hashes[path] = hash_val
    
    # Check for differences
    added = []
    modified = []
    removed = []
    unchanged = 0
    
    # Check current files
    for rel_path in current_files:
        if rel_path not in manifest_hashes:
            added.append(rel_path)
        else:
            # Check hash
            current_hash = compute_file_hash(root_path / rel_path)
            if current_hash and current_hash != manifest_hashes[rel_path]:
                modified.append({
                    'path': rel_path,
                    'expected': manifest_hashes[rel_path],
                    'actual': current_hash
                })
            else:
                unchanged += 1
    
    # Check for removed files
    for path in manifest_hashes:
        if path not in current_files:
            removed.append(path)
    
    # Print results
    print("=" * 60)
    print("Manifest Verification Results")
    print("=" * 60)
    print()
    
    print(f"Unchanged: {unchanged}")
    print()
    
    if added:
        print(f"Added ({len(added)}):")
        for f in sorted(added)[:10]:
            print(f"  + {f}")
        if len(added) > 10:
            print(f"  ... and {len(added) - 10} more")
        print()
    
    if modified:
        print(f"Modified ({len(modified)}):")
        for item in sorted(modified, key=lambda x: x['path'])[:10]:
            print(f"  ! {item['path']}")
            print(f"    Expected: {item['expected'][:20]}...")
            print(f"    Actual:   {item['actual'][:20]}...")
        if len(modified) > 10:
            print(f"  ... and {len(modified) - 10} more")
        print()
    
    if removed:
        print(f"Removed ({len(removed)}):")
        for f in sorted(removed)[:10]:
            print(f"  - {f}")
        if len(removed) > 10:
            print(f"  ... and {len(removed) - 10} more")
        print()
    
    # Summary
    total_issues = len(added) + len(modified) + len(removed)
    
    print("=" * 60)
    if total_issues == 0:
        print("Result: MATCH [PASS]")
        print("The manifest is up to date with the repository.")
    else:
        print(f"Result: MISMATCH [FAIL]")
        print(f"Found {total_issues} difference(s):")
        print(f"  Added:    {len(added)}")
        print(f"  Modified: {len(modified)}")
        print(f"  Removed:  {len(removed)}")
        print()
        print("Run: python app/scripts/generate_manifest.py")
        print("To update the manifest with current state.")
    
    return total_issues == 0


def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description='Verify OneShot manifest against repository'
    )
    parser.add_argument(
        'manifest',
        nargs='?',
        default='app/manifest.json',
        help='Path to manifest.json (default: app/manifest.json)'
    )
    parser.add_argument(
        '--root', '-r',
        default='.',
        help='Root directory to scan (default: .)'
    )
    
    args = parser.parse_args()
    
    # Check manifest exists
    manifest_path = Path(args.manifest)
    if not manifest_path.exists():
        print(f"ERROR: Manifest not found: {args.manifest}")
        sys.exit(1)
    
    # Verify
    success = verify_manifest(str(manifest_path), root=args.root)
    sys.exit(0 if success else 1)


if __name__ == '__main__':
    main()
