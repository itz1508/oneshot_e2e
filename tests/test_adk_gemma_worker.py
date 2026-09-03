from __future__ import annotations
import json, os, subprocess, sys, tempfile, unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class AdkGemmaWorkerTests(unittest.TestCase):
    def _worker(self, draft: Path):
        env = {
            **os.environ,
            "ONESHOT_ADK_TEST_DRAFT_FILE": str(draft),
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

    def test_local_ai_example_config_declares_live_settings_only(self):
        text = (ROOT / "app/config/local-ai.env.example").read_text(
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
