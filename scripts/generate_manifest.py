from __future__ import annotations
import hashlib
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
EXCLUDED={'node_modules','__pycache__','.git','data','.venv','.ollama','dist','.pytest_cache'}
files=sorted((path for path in ROOT.rglob('*') if path.is_file() and path.name!='MANIFEST.sha256' and not any(part in EXCLUDED for part in path.relative_to(ROOT).parts)),key=lambda path:path.relative_to(ROOT).as_posix())
lines=[f"{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.relative_to(ROOT).as_posix()}" for path in files]
(ROOT/'MANIFEST.sha256').write_text('\n'.join(lines)+'\n',encoding='utf-8',newline='\n')
print(f'MANIFEST_GENERATED entries={len(lines)}')
