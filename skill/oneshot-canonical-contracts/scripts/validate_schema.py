from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parent))
from _invoke import invoke, main
def run(payload:dict): return invoke("validate_schema",payload)
if __name__=="__main__": main("validate_schema")
