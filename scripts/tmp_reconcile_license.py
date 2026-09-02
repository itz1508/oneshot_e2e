#!/usr/bin/env python3
"""One-shot staging helper for Apache-2.0 reconciliation. Deleted after use."""

from pathlib import Path

root = Path(__file__).resolve().parent.parent

third_party_license = root / "THIRD_PARTY_LICENSES" / "Google-ADK-Apache-2.0.txt"
license_text = third_party_license.read_text(encoding="utf-8").rstrip() + "\n\n"
if "APPENDIX: How to apply the Apache License to your work." not in license_text:
    license_text += '''APPENDIX: How to apply the Apache License to your work.

   To apply the Apache License to your work, attach the following
   boilerplate notice, with the fields enclosed by brackets "[]"
   replaced with your own identifying information. (Don't include
   the brackets!)  The text should be enclosed in the appropriate
   comment syntax for the file format. We also recommend that a
   file or class name and description of purpose be included on the
   same "printed page" as the copyright notice for easier
   identification within third-party archives.

Copyright [yyyy] [name of copyright owner]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
'''
(root / "LICENSE").write_text(license_text, encoding="utf-8", newline="\n")

package_path = root / "package.json"
package_text = package_path.read_text(encoding="utf-8")
old_license = '"license": "UNLICENSED"'
assert package_text.count(old_license) == 1, "unexpected package.json license state"
package_path.write_text(package_text.replace(old_license, '"license": "Apache-2.0"'), encoding="utf-8", newline="\n")

notice = '''OneShot E2E
Copyright 2026 OneShot Authors

OneShot-owned source code and materials in this repository are licensed under
the Apache License, Version 2.0. See the repository root LICENSE file.

========================================================================
Third-Party Software Notice
========================================================================

Third-party software remains governed by its own upstream license terms.
The OneShot Apache-2.0 license applies to OneShot-owned material and does not
replace or override applicable third-party licenses.

1. Google ADK for TypeScript (@google/adk)
   - Copyright Google LLC
   - Licensed under the Apache License, Version 2.0
   - Used by OneShot workflow orchestration.
   - License copy:
     THIRD_PARTY_LICENSES/Google-ADK-Apache-2.0.txt

2. Google ADK research-provider dependencies
   - Used by the isolated researcher provider adapter under
     backend/role/researcher/provider/adk-gemma2/
   - Governed by their respective upstream licenses.
   - Manifest: requirements-adk.txt

3. LiteLLM (litellm)
   - Copyright (c) BerriAI
   - Governed by its applicable upstream license.
   - Manifest: requirements-adk.txt

4. Redis Client (redis-py)
   - Copyright (c) Redis Ltd.
   - Governed by its applicable upstream license.
   - Manifest: requirements-adk.txt
'''
(root / "NOTICE").write_text(notice, encoding="utf-8", newline="\n")

readme_path = root / "README.md"
readme = readme_path.read_text(encoding="utf-8")
old = "OneShot-owned source is provided under the [OneShot Evaluator License](LICENSE). Third-party software remains under its own upstream licenses; see [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES/)."
new = "OneShot-owned source is licensed under the [Apache License 2.0](LICENSE). Third-party software remains under its applicable upstream licenses; see [NOTICE](NOTICE) and [THIRD_PARTY_LICENSES](THIRD_PARTY_LICENSES/)."
assert readme.count(old) == 1, "README license statement drifted"
readme_path.write_text(readme.replace(old, new), encoding="utf-8", newline="\n")

judge_path = root / "docs" / "JUDGE_README.md"
judge = judge_path.read_text(encoding="utf-8")
old = "Apache License, Version 2.0. See [`LICENSE`](LICENSE) and [`NOTICE`](NOTICE) for details."
new = "Apache License, Version 2.0. See [`LICENSE`](../LICENSE), [`NOTICE`](../NOTICE), and [`THIRD_PARTY_LICENSES`](../THIRD_PARTY_LICENSES/) for details."
assert judge.count(old) == 1, "JUDGE_README license links drifted"
judge_path.write_text(judge.replace(old, new), encoding="utf-8", newline="\n")

pdf_script_path = root / "scripts" / "generate_workflow_pdf.py"
pdf_script = pdf_script_path.read_text(encoding="utf-8")
old = "CONFIDENTIAL & PROPRIETARY • APACHE LICENSE 2.0 • SHA-256 VERIFIED"
new = "ONESHOT • APACHE LICENSE 2.0 • SHA-256 VERIFIED"
assert pdf_script.count(old) == 1, "workflow PDF footer drifted"
pdf_script_path.write_text(pdf_script.replace(old, new), encoding="utf-8", newline="\n")

workflow_path = root / ".github" / "workflows" / "tmp-adk-live-real-e2e.yml"
workflow = workflow_path.read_text(encoding="utf-8")
old = """      - name: Verify canonical contracts and manifest
        run: npm run verify
"""
new = """      - name: Verify canonical contracts, Apache-2.0 license, and manifest
        run: |
          npm run verify
          python scripts/verify_license.py
          python scripts/generate_manifest.py
          git diff --exit-code -- MANIFEST.sha256
          python scripts/generate_manifest.py
          git diff --exit-code -- MANIFEST.sha256
"""
assert workflow.count(old) == 1, "E2E verification step drifted"
workflow_path.write_text(workflow.replace(old, new), encoding="utf-8", newline="\n")

verifier = r'''#!/usr/bin/env python3
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
'''
(root / "scripts" / "verify_license.py").write_text(verifier, encoding="utf-8", newline="\n")

print("LICENSE_RECONCILIATION_MUTATIONS=APPLIED")
