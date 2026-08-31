from __future__ import annotations
import hashlib,sys,zipfile
from pathlib import Path
FIXED=(2020,1,1,0,0,0)
EXCLUDED_DIRS={'node_modules','__pycache__','.git','data','.venv','.ollama'}
def build(src:Path,out:Path):
    files=[p for p in src.rglob('*') if p.is_file() and not any(part in EXCLUDED_DIRS for part in p.relative_to(src).parts) and p.name not in {'.DS_Store'}]
    files=sorted(files,key=lambda p:p.relative_to(src).as_posix())
    with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED,compresslevel=9) as z:
        for p in files:
            rel=f'{src.name}/{p.relative_to(src).as_posix()}'
            zi=zipfile.ZipInfo(rel,FIXED);zi.compress_type=zipfile.ZIP_DEFLATED;zi.create_system=3;zi.external_attr=(0o100644<<16)
            z.writestr(zi,p.read_bytes(),compress_type=zipfile.ZIP_DEFLATED,compresslevel=9)
    h=hashlib.sha256(out.read_bytes()).hexdigest(); print(h); return h
if __name__=='__main__':
    if len(sys.argv)!=3: raise SystemExit('usage: build_deterministic_zip.py SRC OUT')
    build(Path(sys.argv[1]).resolve(),Path(sys.argv[2]).resolve())
