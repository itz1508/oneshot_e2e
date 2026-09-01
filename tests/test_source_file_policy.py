from __future__ import annotations

import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from scripts.build_deterministic_zip import build
from scripts.generate_manifest import generate_manifest
from scripts.verify_manifest import verify_manifest


class SourceFilePolicyTests(unittest.TestCase):
    def test_manifest_verifier_and_zip_share_secret_exclusions(self) -> None:
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as output_temp:
            root = Path(source_temp) / "source"
            root.mkdir()
            fixtures = {
                "safe.txt": "safe",
                ".env.example": "public",
                ".env.workspace.example": "public",
                ".env": "secret",
                ".env.local": "secret",
                "private.pem": "secret",
                "credentials.json": "secret",
                "secrets-local.txt": "secret",
                "nested/.env.example": "secret",
                "data/runtime.json": "secret",
            }
            for relative_path, content in fixtures.items():
                target = root / relative_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

            self.assertEqual(generate_manifest(root), 3)
            manifest = root / "MANIFEST.sha256"
            listed = {
                line.split("  ", 1)[1]
                for line in manifest.read_text(encoding="utf-8").splitlines()
            }
            self.assertEqual(
                listed,
                {"safe.txt", ".env.example", ".env.workspace.example"},
            )

            (root / ".env.after-generation").write_text("secret", encoding="utf-8")
            self.assertEqual(verify_manifest(root), [])

            env_hash = hashlib.sha256((root / ".env").read_bytes()).hexdigest()
            manifest.write_text(
                manifest.read_text(encoding="utf-8") + f"{env_hash}  .env\n",
                encoding="utf-8",
                newline="\n",
            )
            failures = verify_manifest(root)
            self.assertIn("forbidden manifest entry .env", failures)

            archive = Path(output_temp) / "source.zip"
            build(root, archive)
            with zipfile.ZipFile(archive) as bundle:
                archived = {
                    name.removeprefix(f"{root.name}/")
                    for name in bundle.namelist()
                }
            self.assertEqual(
                archived,
                {"safe.txt", ".env.example", ".env.workspace.example"},
            )


if __name__ == "__main__":
    unittest.main()
