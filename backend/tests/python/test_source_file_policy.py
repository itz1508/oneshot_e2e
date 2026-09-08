from __future__ import annotations

import hashlib
import tempfile
import unittest
import zipfile
from pathlib import Path

from app.scripts.build_deterministic_zip import build, canonical_archive_bytes
from app.scripts.generate_manifest import generate_manifest
from app.scripts.source_file_policy import canonical_file_bytes, canonical_sha256
from app.scripts.verify_manifest import verify_manifest


class SourceFilePolicyTests(unittest.TestCase):
    def test_canonical_bytes_normalize_crlf_to_lf_without_touching_binary(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            crlf = root / "crlf.txt"
            crlf.write_bytes(b"line-one\r\nline-two\r\n")
            lone_cr = root / "lone-cr.txt"
            lone_cr.write_bytes(b"line-one\rline-two\r")
            binary = root / "asset.bin"
            binary.write_bytes(b"\x00\x01\r\n\x02")

            self.assertEqual(canonical_file_bytes(crlf), b"line-one\nline-two\n")
            # Lone CR bytes are byte-stable legacy content, not CRLF text.
            self.assertEqual(canonical_file_bytes(lone_cr), b"line-one\rline-two\r")
            self.assertEqual(canonical_file_bytes(binary), b"\x00\x01\r\n\x02")

            lf = root / "lf.txt"
            lf.write_bytes(b"line-one\nline-two\n")
            self.assertEqual(canonical_sha256(crlf), canonical_sha256(lf))

    def test_canonical_manifest_and_archive_agree_across_line_endings(self) -> None:
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as output_temp:
            lf_root = Path(source_temp) / "lf-source"
            crlf_root = Path(source_temp) / "crlf-source"
            for root in (lf_root, crlf_root):
                (root / "nested").mkdir(parents=True)
            (lf_root / "nested" / "note.txt").write_bytes(b"alpha\nbeta\n")
            (crlf_root / "nested" / "note.txt").write_bytes(b"alpha\r\nbeta\r\n")

            self.assertEqual(generate_manifest(lf_root), 1)
            self.assertEqual(generate_manifest(crlf_root), 1)
            lf_manifest = (lf_root / "MANIFEST.sha256").read_text(encoding="utf-8")
            crlf_manifest = (crlf_root / "MANIFEST.sha256").read_text(encoding="utf-8")
            # Manifest paths differ by fixture root, but canonical hashes match.
            self.assertEqual(
                lf_manifest.split("  ", 1)[0], crlf_manifest.split("  ", 1)[0]
            )
            self.assertEqual(verify_manifest(lf_root), [])
            self.assertEqual(verify_manifest(crlf_root), [])

            lf_zip = Path(output_temp) / "lf.zip"
            crlf_zip = Path(output_temp) / "crlf.zip"
            lf_digest = build(lf_root, lf_zip)
            crlf_digest = build(crlf_root, crlf_zip)
            # Archive member names include the differing fixture directory, so
            # compare canonical payload bytes rather than whole-ZIP digests.
            with zipfile.ZipFile(lf_zip) as lf_bundle, zipfile.ZipFile(
                crlf_zip
            ) as crlf_bundle:
                lf_payload = lf_bundle.read(f"{lf_root.name}/nested/note.txt")
                crlf_payload = crlf_bundle.read(f"{crlf_root.name}/nested/note.txt")
            self.assertEqual(lf_payload, b"alpha\nbeta\n")
            self.assertEqual(crlf_payload, b"alpha\nbeta\n")
            self.assertEqual(
                canonical_archive_bytes(lf_root / "nested" / "note.txt"),
                canonical_archive_bytes(crlf_root / "nested" / "note.txt"),
            )
            self.assertIsInstance(lf_digest, str)
            self.assertIsInstance(crlf_digest, str)

    def test_manifest_verifier_and_zip_share_secret_exclusions(self) -> None:
        with tempfile.TemporaryDirectory() as source_temp, tempfile.TemporaryDirectory() as output_temp:
            root = Path(source_temp) / "source"
            root.mkdir()
            fixtures = {
                "safe.txt": "safe",
                "app/env/.env.example": "public",
                "app/env/.env.workspace.example": "public",
                ".env": "secret",
                ".env.local": "secret",
                "app/env/.env": "secret",
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
                {"safe.txt", "app/env/.env.example", "app/env/.env.workspace.example"},
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
                {"safe.txt", "app/env/.env.example", "app/env/.env.workspace.example"},
            )

    def test_root_level_ignored_directories_are_excluded_but_nested_source_is_not(self) -> None:
        with tempfile.TemporaryDirectory() as source_temp:
            root = Path(source_temp)
            fixtures = {
                "safe.txt": "safe",
                "backend/runtime/queue.ts": "backend source",
                "runtime/server.log": "local runtime noise",
                "oneshot-worker.log": "changing worker diagnostics",
                "server.pid": "1234",
                "download.tmp": "incomplete runtime output",
                "external/intergration/google_adk/agent.ts": "local scratch clone",
                ".headless_profile/Crashpad/settings.dat": "local browser state",
            }
            for relative_path, content in fixtures.items():
                target = root / relative_path
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_text(content, encoding="utf-8")

            self.assertEqual(generate_manifest(root), 2)
            manifest = root / "MANIFEST.sha256"
            listed = {
                line.split("  ", 1)[1]
                for line in manifest.read_text(encoding="utf-8").splitlines()
            }
            self.assertEqual(listed, {"safe.txt", "backend/runtime/queue.ts"})
            self.assertEqual(verify_manifest(root), [])


if __name__ == "__main__":
    unittest.main()
