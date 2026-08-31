from __future__ import annotations
import hashlib
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
errors=[]
listed=set()
for line in (ROOT/'MANIFEST.sha256').read_text().splitlines():
    expected,rel=line.split('  ',1);listed.add(rel);p=ROOT/rel
    if not p.is_file(): errors.append(f'missing {rel}'); continue
    actual=hashlib.sha256(p.read_bytes()).hexdigest()
    if actual!=expected: errors.append(f'hash mismatch {rel}')
excluded={'node_modules','__pycache__','.git','data','.venv','.ollama'}
actual={path.relative_to(ROOT).as_posix() for path in ROOT.rglob('*') if path.is_file() and path.name!='MANIFEST.sha256' and not any(part in excluded for part in path.relative_to(ROOT).parts)}
for rel in sorted(actual-listed):errors.append(f'unlisted {rel}')
for rel in sorted(listed-actual):errors.append(f'manifest-only {rel}')
if errors: raise SystemExit('\n'.join(errors))
print('MANIFEST_VERIFIED')
