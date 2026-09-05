from __future__ import annotations
import hashlib
from .canonicalize import canonicalize, CANONICALIZATION_ID

def create_hash(confirmed_core: dict) -> str:
    return hashlib.sha256(canonicalize(confirmed_core)).hexdigest()

def verify_hash(confirmed_core: dict, expected_hash: str) -> dict:
    actual=create_hash(confirmed_core)
    return {'canonicalization_id':CANONICALIZATION_ID,'algorithm':'sha256','created_hash':expected_hash,'recomputed_hash':actual,'equal':actual==expected_hash}
