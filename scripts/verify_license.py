#!/usr/bin/env python3
"""Verify the OneShot hackathon repository Apache-2.0 licensing state."""

from __future__ import annotations

import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def fail(message: str) -> None:
    raise SystemExit(f"LICENSE_GATE=ROOT_CAUSE {message}")


def require(condition: bool, message: str) -> None:
    if not condition:
        fail(message)


license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
for required in (
    "Apache License",
    "Version 2.0, January 2004",
    "END OF TERMS AND CONDITIONS",
    "APPENDIX: How to apply the Apache License to your work.",
):
    require(required in license_text, f"LICENSE missing required text: {required}")

package = json.loads((ROOT / "package.json").read_text(encoding="utf-8"))
require(package.get("license") == "Apache-2.0", "package.json license is not Apache-2.0")

notice = (ROOT / "NOTICE").read_text(encoding="utf-8")
require("OneShot-owned source code and materials in this repository are licensed under" in notice, "NOTICE missing OneShot license statement")
require("Apache License, Version 2.0" in notice, "NOTICE missing Apache-2.0")
require("THIRD_PARTY_LICENSES/Google-ADK-Apache-2.0.txt" in notice, "NOTICE missing Google ADK license pointer")

require((ROOT / "THIRD_PARTY_LICENSES" / "Google-ADK-Apache-2.0.txt").is_file(), "Google ADK Apache-2.0 license copy missing")
require((ROOT / "backend" / "role" / "researcher" / "provider" / "adk-gemma2" / "NOTICE.md").is_file(), "ADK provider notice missing")

readme = (ROOT / "README.md").read_text(encoding="utf-8")
require("[Apache License 2.0](LICENSE)" in readme, "README Apache-2.0 link missing")
judge = (ROOT / "docs" / "JUDGE_README.md").read_text(encoding="utf-8")
require("[`LICENSE`](../LICENSE)" in judge, "JUDGE_README LICENSE link is not repository-relative")
require("[`NOTICE`](../NOTICE)" in judge, "JUDGE_README NOTICE link is not repository-relative")
require("[`THIRD_PARTY_LICENSES`](../THIRD_PARTY_LICENSES/)" in judge, "JUDGE_README third-party license link missing")

tracked = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT).split(b"\0")
text_suffixes = {"", ".md", ".txt", ".json", ".jsonl", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".sh", ".ps1", ".yml", ".yaml", ".toml", ".ini", ".cfg"}
skip_prefixes = ("THIRD_PARTY_LICENSES/", "vendor/")
skip_files = {"scripts/verify_license.py"}
prohibited = (
    "UN" + "LICENSED",
    "OneShot " + "Evaluator License",
    "evaluation " + "only",
    "CONFIDENTIAL & " + "PROPRIETARY",
    "All rights " + "reserved",
    "All Rights " + "Reserved",
)
conflicts: list[tuple[str, str]] = []
proprietary_mentions: list[str] = []
scanned = 0
for raw in tracked:
    if not raw:
        continue
    rel = raw.decode("utf-8")
    if rel in skip_files or rel.startswith(skip_prefixes):
        continue
    path = ROOT / rel
    if not path.is_file() or path.suffix.lower() not in text_suffixes:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    scanned += 1
    lowered = text.lower()
    if "proprietary" in lowered:
        proprietary_mentions.append(rel)
    for phrase in prohibited:
        if phrase.lower() in lowered:
            conflicts.append((rel, phrase))

print(f"LICENSE_SCAN_FILES={scanned}")
print("LICENSE_SCAN_PROPRIETARY_MATCHES=" + (",".join(sorted(proprietary_mentions)) if proprietary_mentions else "NONE"))
if conflicts:
    for rel, phrase in conflicts:
        print(f"LICENSE_CONFLICT file={rel} phrase={phrase}")
    fail(f"{len(conflicts)} conflicting licensing statements remain")
if proprietary_mentions:
    fail("generic proprietary wording remains outside third-party license material")

print("LICENSE_ROOT=Apache-2.0")
print("PACKAGE_LICENSE=Apache-2.0")
print("GOOGLE_ADK_LICENSE=PRESERVED")
print("LICENSE_GATE=PASSED")
