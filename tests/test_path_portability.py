from __future__ import annotations

import re
import unittest
from pathlib import Path

from scripts.source_file_policy import iter_source_files


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DRIVE_QUALIFIED_PATH = re.compile(r"(?i)(?:c:|d:)[\\/]")


class PathPortabilityTests(unittest.TestCase):
    def test_source_text_has_no_machine_specific_drive_paths(self) -> None:
        offenders: list[str] = []
        for path in iter_source_files(PROJECT_ROOT):
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                continue
            if DRIVE_QUALIFIED_PATH.search(content):
                offenders.append(path.relative_to(PROJECT_ROOT).as_posix())

        self.assertEqual(offenders, [])


if __name__ == "__main__":
    unittest.main()
