from __future__ import annotations
import json, unittest
from pathlib import Path
from validation.canonicalize import canonicalize
from validation.hash_proof import create_hash, verify_hash
from validation.triple_validation import run_triple
from validation.evaluation import evaluate_plan
from validation.schema_validator import SchemaStore
from validation.models import (
    ConfirmedPackage,
    ExecutionAuthorizationModel,
    ExecutionEvidenceModel,
    ResearchRequestModel,
    SandboxExecutionInputModel,
)

ROOT = Path(__file__).resolve().parents[1]


class SandboxAdmissionTests(unittest.TestCase):
    def setUp(self):
        self.b = json.loads((ROOT / "app/fixtures/e2e/complete-success.json").read_text(encoding="utf-8"))
        self.s = SchemaStore(ROOT / "schema")
        self.g = json.loads((ROOT / "workflow/graph.json").read_text(encoding="utf-8"))
        self.confirmed_pkg = self._build_confirmed()
        self.canonical_hash = create_hash(self.confirmed_pkg["core"])

    def _build_confirmed(self):
        ev = evaluate_plan(
            self.b["plan"],
            self.b["goal"],
            self.b["researcher"],
            self.b["fixture"],
            self.b["schema_artifact"],
            self.b["validation"],
        )
        self.b["evaluation"] = ev
        t = run_triple(
            self.b["plan"],
            self.b["validation"],
            self.b["schema_artifact"],
            self.b["fixture"],
            self.b["goal"],
            self.s,
            self.g,
        )
        core = {
            k: self.b[k]
            for k in [
                "researcher",
                "plan",
                "schema_artifact",
                "fixture",
                "goal",
                "validation",
                "audit",
                "gap_analysis",
                "evaluation",
            ]
        }
        core["triple_validation"] = t
        return {"confirmed": True, "core": core}

    def test_sandbox_admission_model_validates_confirmed_package_and_hash(self):
        payload = {
            "confirmed_package": self.confirmed_pkg,
            "hash": self.canonical_hash,
            "execution_authorization": {
                "execution_id": "exec:test-1",
                "timeout_seconds": 120,
                "memory_limit_mb": 512,
                "cpu_limit": 1.0,
                "pid_limit": 32,
                "network_policy": "DENY_ALL",
                "environment_allowlist": ["NODE_ENV"],
                "max_output_bytes": 1048576,
                "max_files_changed": 50,
                "max_total_bytes_written": 10485760,
            },
        }
        model = SandboxExecutionInputModel.model_validate(payload)
        self.assertEqual(model.hash, self.canonical_hash)
        self.assertEqual(
            model.execution_authorization.network_policy, "DENY_ALL"
        )

        proof = verify_hash(self.confirmed_pkg["core"], model.hash)
        self.assertTrue(proof["equal"])

    def test_sandbox_admission_rejects_tampered_core_hash(self):
        tampered_core = dict(self.confirmed_pkg["core"])
        tampered_core["plan"] = dict(tampered_core["plan"])
        tampered_core["plan"]["requirements"] = [
            {
                "requirement_id": "req:tampered:1",
                "statement": "TAMPERED",
                "evidence_ids": [],
            }
        ]

        proof = verify_hash(tampered_core, self.canonical_hash)
        self.assertFalse(proof["equal"])
        self.assertNotEqual(proof["recomputed_hash"], self.canonical_hash)

    def test_execution_evidence_model_validation(self):
        evidence_payload = {
            "execution_id": "exec:test-1",
            "sandbox_id": "sandbox:test-1:12345",
            "confirmed_package_hash": self.canonical_hash,
            "started_at": "2026-08-31T12:00:00.000Z",
            "completed_at": "2026-08-31T12:00:01.000Z",
            "commands": ["echo test"],
            "exit_codes": [0],
            "stdout_refs": ["stdout:exec:test-1:1"],
            "stderr_refs": [],
            "file_changes": [{"path": "/work/test.txt", "action": "created", "bytes": 10}],
            "bytes_written": 10,
            "resource_usage": {"duration_ms": 150.5, "peak_memory_mb": 16.0, "cpu_time_ms": 120.0},
            "environment_allowlist_used": ["NODE_ENV"],
            "network_policy_used": "DENY_ALL",
            "cleanup_result": {"workspace_cleaned": True, "processes_terminated": True},
            "hash_sandbox": self.canonical_hash,
        }

        model = ExecutionEvidenceModel.model_validate(evidence_payload)
        self.assertEqual(model.execution_id, "exec:test-1")
        self.assertEqual(model.hash_sandbox, self.canonical_hash)
        self.assertTrue(model.cleanup_result.workspace_cleaned)

    def test_research_request_model_validation(self):
        req_payload = {
            "request_id": "res_req:test:1",
            "issue": "Missing target deployment specification",
            "why_research_is_required": "Target architecture was not identified during planning",
            "evidence_ids": ["evidence:test:1"],
            "missing_information": ["target_arch"],
            "execution_id": "exec:test-1",
        }
        model = ResearchRequestModel.model_validate(req_payload)
        self.assertEqual(model.request_id, "res_req:test:1")
        self.assertEqual(model.missing_information, ["target_arch"])


if __name__ == "__main__":
    unittest.main()
