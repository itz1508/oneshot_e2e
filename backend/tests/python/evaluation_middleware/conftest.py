"""
Pytest configuration for the evaluation_middleware test suite.

Inserts backend/validation/python into sys.path so that
`import evaluation_middleware` resolves from the canonical location.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent / "validation" / "python"))
