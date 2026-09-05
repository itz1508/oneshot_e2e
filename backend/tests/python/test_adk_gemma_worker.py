from __future__ import annotations
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class AdkGemmaWorkerTests(unittest.TestCase):
    def _worker(self, draft: Path):
        env = {
            **os.environ,
            "ONESHOT_ADK_TEST_DRAFT_FILE": str(draft),
            "GEMMA2_DISTRIBUTION_MODEL": "test-distribution",
            "GEMMA2_RESEARCH_MODEL": "test-research",
            "GEMMA2_SYNTHESIS_MODEL": "test-synthesis",
            "CACHE_TTL": "3600",
        }
        return subprocess.Popen(
            [
                sys.executable,
                str(
                    ROOT
                    / "backend/role/researcher/provider/adk-gemma2/worker.py"
                ),
            ],
            cwd=ROOT,
            env=env,
            text=True,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )

    def _call(self, p, request):
        assert p.stdin and p.stdout
        p.stdin.write(json.dumps(request) + "\n")
        p.stdin.flush()
        return json.loads(p.stdout.readline())

    def _close(self, p):
        p.terminate()
        p.wait(timeout=5)
        for f in (p.stdin, p.stdout, p.stderr):
            if f:
                f.close()

    def _source_draft(self):
        return json.loads(
            (ROOT / "app/fixtures/provider/adk-research-draft.json").read_text(
                encoding="utf-8"
            )
        )

    def _executable_prompt(self):
        statement = (
            "Build a disposable CommonJS Node media-support utility inside the OneShot sandbox. "
            "The implementation must create media.js exporting supports(name), returning true only for .mp4 and .mp3 filenames case-insensitively. "
            "Create verify.js that checks MP4=true, MP3=true, WAV=false and prints exactly PRODUCT_VERIFY mp4=true mp3=true wav=false. "
            "The implementation plan must be executable by the sandbox: every plan step description must be a direct shell command beginning with node. "
            "Before creating files, include a node command that verifies media.js and verify.js do not exist and prints exactly BEFORE_VERIFY target_files_absent=true. "
            "The final step must run node verify.js."
        )
        return {
            "prompt_id": "prompt:worker-semantic-test",
            "intent": "Build a disposable CommonJS Node media-support utility",
            "requested_outcome": "Create and verify the utility through executable sandbox commands",
            "context": [{"context_id": "ctx:1", "statement": statement}],
            "research_direction": [
                "Requirements: preserve explicit user requirements.",
                "Scope control: do not reduce explicit execution constraints.",
            ],
        }

    def test_worker_structured_draft_without_external_runtime(self):
        p = self._worker(ROOT / "app/fixtures/provider/adk-research-draft.json")
        try:
            request = {
                "id": 1,
                "op": "research",
                "payload": {
                    "prompt": {
                        "prompt_id": "p",
                        "intent": "i",
                        "requested_outcome": "o",
                        "context": [],
                        "research_direction": ["r"],
                    },
                    "run_id": "r",
                },
            }
            out = self._call(p, request)
            self.assertTrue(out["ok"])
            self.assertEqual(len(out["result"]["requirements"]), 2)
            self.assertEqual(len(out["result"]["success_criteria"]), 2)
        finally:
            self._close(p)

    def test_cache_reuses_noncanonical_draft_for_same_prompt(self):
        source = json.loads(
            (ROOT / "app/fixtures/provider/adk-research-draft.json").read_text(
                encoding="utf-8"
            )
        )
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "draft.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            p = self._worker(path)
            try:
                prompt = {
                    "prompt_id": "p1",
                    "intent": "same",
                    "requested_outcome": "o",
                    "context": [
                        {"context_id": "c1", "statement": "same context"}
                    ],
                    "research_direction": ["r"],
                }
                first = self._call(
                    p,
                    {
                        "id": 1,
                        "op": "research",
                        "payload": {"prompt": prompt, "run_id": "r1"},
                    },
                )["result"]
                source["summary"] = "MUTATED SOURCE THAT CACHE MUST HIDE"
                path.write_text(json.dumps(source), encoding="utf-8")
                prompt2 = {
                    "prompt_id": "p2",
                    "intent": "same",
                    "requested_outcome": "o",
                    "context": [
                        {"context_id": "c2", "statement": "same context"}
                    ],
                    "research_direction": ["r"],
                }
                second = self._call(
                    p,
                    {
                        "id": 2,
                        "op": "research",
                        "payload": {"prompt": prompt2, "run_id": "r2"},
                    },
                )["result"]
                self.assertEqual(first["summary"], second["summary"])
                self.assertNotEqual(second["summary"], source["summary"])
            finally:
                self._close(p)

    def test_explicit_executable_requirement_rejects_reduced_prose_draft(self):
        source = self._source_draft()
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "draft.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            p = self._worker(path)
            try:
                out = self._call(
                    p,
                    {
                        "id": 3,
                        "op": "research",
                        "payload": {
                            "prompt": self._executable_prompt(),
                            "run_id": "r3",
                        },
                    },
                )
                self.assertFalse(out["ok"])
                self.assertIn(
                    "NOT_VALID deterministic adapter draft",
                    out["error"],
                )
                self.assertIn(
                    "expected command beginning with node",
                    out["error"],
                )
                self.assertIn(
                    "BEFORE_VERIFY target_files_absent=true",
                    out["error"],
                )
                self.assertIn(
                    "PRODUCT_VERIFY mp4=true mp3=true wav=false",
                    out["error"],
                )
            finally:
                self._close(p)

    def test_explicit_executable_requirement_accepts_preserved_commands(self):
        source = self._source_draft()
        source["plan_steps"] = [
            {
                "description": (
                    "node -e \"const fs=require('fs');"
                    "if(fs.existsSync('media.js')||fs.existsSync('verify.js'))process.exit(2);"
                    "console.log('BEFORE_VERIFY target_files_absent=true')\""
                ),
                "responsibility": "ProductImplementation",
                "requirement_indexes": [0],
            },
            {
                "description": (
                    "node -e \"require('fs').writeFileSync('media.js',"
                    "'module.exports={supports:(name)=>/\\\\.(mp4|mp3)$/i.test(name)}\\\\n')\""
                ),
                "responsibility": "ProductImplementation",
                "requirement_indexes": [0],
            },
            {
                "description": (
                    "node -e \"require('fs').writeFileSync('verify.js',"
                    "'console.log(\\\\\\\"PRODUCT_VERIFY mp4=true mp3=true wav=false\\\\\\\")\\\\n')\""
                ),
                "responsibility": "CanonicalProof",
                "requirement_indexes": [1],
            },
            {
                "description": "node verify.js",
                "responsibility": "CanonicalProof",
                "requirement_indexes": [1],
            },
        ]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "draft.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            p = self._worker(path)
            try:
                out = self._call(
                    p,
                    {
                        "id": 4,
                        "op": "research",
                        "payload": {
                            "prompt": self._executable_prompt(),
                            "run_id": "r4",
                        },
                    },
                )
                self.assertTrue(out["ok"], out)
                self.assertEqual(
                    out["result"]["plan_steps"][-1]["description"],
                    "node verify.js",
                )
            finally:
                self._close(p)

    def test_requirement_indexes_must_resolve_to_actual_requirements(self):
        source = self._source_draft()
        source["plan_steps"][0]["requirement_indexes"] = [99]
        with tempfile.TemporaryDirectory() as td:
            path = Path(td) / "draft.json"
            path.write_text(json.dumps(source), encoding="utf-8")
            p = self._worker(path)
            try:
                out = self._call(
                    p,
                    {
                        "id": 5,
                        "op": "research",
                        "payload": {
                            "prompt": {
                                "prompt_id": "p5",
                                "intent": "test indexes",
                                "requested_outcome": "validated draft",
                                "context": [],
                                "research_direction": [],
                            },
                            "run_id": "r5",
                        },
                    },
                )
                self.assertFalse(out["ok"])
                self.assertIn(
                    "requirement indexes outside 0..1: [99]",
                    out["error"],
                )
            finally:
                self._close(p)

    def test_local_ai_example_config_declares_live_settings_only(self):
        text = (ROOT / "app/env/local-ai.env.example").read_text(
            encoding="utf-8"
        )
        for expected in [
            "GEMMA2_LOCAL_MODEL=gemma2:9b",
            "CACHE_TTL=3600",
        ]:
            self.assertIn(expected, text)
        # Obsolete "prior local performance profile" variables are never read
        # by the runtime and were removed from the example configuration.
        for obsolete in [
            "OLLAMA_CONTEXT_LENGTH=",
            "OLLAMA_KEEP_ALIVE=",
            "OLLAMA_NUM_PARALLEL=",
        ]:
            self.assertNotIn(obsolete, text)


if __name__ == "__main__":
    unittest.main()