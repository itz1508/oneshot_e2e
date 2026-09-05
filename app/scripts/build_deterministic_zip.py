"""Deterministic release/archive tooling.

Builds a byte-reproducible ZIP archive: fixed member timestamps, fixed
permissions, stable POSIX-style member ordering, deterministic compression.
File selection reuses ``source_file_policy.iter_source_files``, so archives
preserve exactly the shared sensitive-file exclusion policy used by
``generate_manifest.py`` / ``verify_manifest.py``.

Usage: python app/scripts/build_deterministic_zip.py SRC OUT
Prints the SHA-256 of the produced archive.
"""
from __future__ import annotations
import hashlib,sys,zipfile
from pathlib import Path
try:
    from .source_file_policy import iter_source_files
except ImportError:
    from source_file_policy import iter_source_files

FIXED=(2020,1,1,0,0,0)
def build(src:Path,out:Path):
    src=src.resolve()
    files=list(iter_source_files(src))
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in files:
            rel=f'{src.name}/{p.relative_to(src).as_posix()}'
            zi=zipfile.ZipInfo(rel,FIXED);zi.compress_type=zipfile.ZIP_DEFLATED;zi.create_system=3;zi.external_attr=(0o100644<<16)
            z.writestr(zi,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    h=hashlib.sha256(out.read_bytes()).hexdigest(); print(h); return h
if __name__=='__main__':
    if len(sys.argv)!=3: raise SystemExit('usage: build_deterministic_zip.py SRC OUT')
    build(Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve())
