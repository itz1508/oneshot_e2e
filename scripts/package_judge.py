#!/usr/bin/env python3
"""
OneShot Judge Package Exporter
Bundles the zero-install judge package (docker-compose, start/stop scripts, docs) into dist/oneshot-judge.zip.
"""
import os
import zipfile
import subprocess
import hashlib
from pathlib import Path

def main():
    root = Path(__file__).resolve().parent.parent
    dist_dir = root / "dist"
    dist_dir.mkdir(parents=True, exist_ok=True)
    
    zip_path = dist_dir / "oneshot-judge.zip"
    judge_dir = root / "deploy" / "judge"
    
    # Calculate image sha256 or digest if docker is available
    image_sha = "oneshot:1.3.0"
    try:
        inspect_out = subprocess.check_output(["docker", "inspect", "--format={{.Id}}", "oneshot:1.3.0"], text=True).strip()
        if inspect_out:
            image_sha = inspect_out
    except Exception:
        pass
    
    sha_file = judge_dir / "IMAGE_SHA256.txt"
    sha_file.write_text(f"IMAGE: oneshot:1.3.0\nDIGEST: {image_sha}\n", encoding="utf-8")
    
    files_to_pack = [
        ("docker-compose.yml", judge_dir / "docker-compose.yml"),
        ("start-oneshot.ps1", judge_dir / "start-oneshot.ps1"),
        ("start-oneshot.sh", judge_dir / "start-oneshot.sh"),
        ("stop-oneshot.ps1", judge_dir / "stop-oneshot.ps1"),
        ("stop-oneshot.sh", judge_dir / "stop-oneshot.sh"),
        (".env.example", judge_dir / ".env.example"),
        ("IMAGE_SHA256.txt", sha_file),
        ("JUDGE_README.md", root / "JUDGE_README.md"),
    ]
    
    print(f"Creating {zip_path}...")
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for arcname, filepath in files_to_pack:
            if filepath.exists():
                zf.write(filepath, arcname)
                print(f"  + {arcname}")
    
    # Also write versioned zip dist/oneshot-judge-1.3.0.zip
    versioned_zip = dist_dir / "oneshot-judge-1.3.0.zip"
    with open(zip_path, "rb") as src, open(versioned_zip, "wb") as dst:
        dst.write(src.read())

    print(f"Successfully packaged {zip_path} and {versioned_zip}")

if __name__ == "__main__":
    main()
