from __future__ import annotations
import re
from typing import Any


def resolve_path(root: Any, path: str):
    cur = root
    if path in ("", "$", "researchBundle"):
        return cur
    p = path[2:] if path.startswith("$.") else path
    if p.startswith("researchBundle."):
        p = p[len("researchBundle."):]
    for part in p.split("."):
        if isinstance(cur, list):
            cur = cur[int(part)]
        elif isinstance(cur, dict) and part in cur:
            cur = cur[part]
        else:
            raise KeyError(path)
    return cur


def run_assertion(assertion: dict, plan: dict, schema_store=None, graph=None):
    op = assertion["operator"]
    target = assertion.get("target") or assertion.get("actual", "")
    expected = assertion.get("expected")
    assertion_id = assertion.get("assertion_id") or assertion.get("id", "assertion")

    # Resolve fixture.inputRefs[ref_id] pattern if present
    if isinstance(expected, str) and expected.startswith("fixture.inputRefs[") and expected.endswith("]"):
        expected = expected[len("fixture.inputRefs["):-1]

    exists = True
    try:
        actual = resolve_path(plan, target)
    except (KeyError, IndexError, ValueError):
        exists = False
        actual = None

    if op == "exists":
        ok = exists and (actual is not None and actual != "")
    elif op == "equals":
        ok = exists and actual == expected
    elif op == "contains":
        ok = exists and hasattr(actual, "__contains__") and expected in actual
    elif op == "references":
        if not exists:
            ok = False
        elif isinstance(actual, (list, tuple, set)):
            # Check direct inclusion or dictionary item field matches (e.g. evidence item with source or provenance)
            ok = expected in actual or any(
                isinstance(e, dict) and (e.get("source") == expected or e.get("provenance") == expected or expected in str(e.get("source", "")) or expected in str(e.get("provenance", "")))
                for e in actual
            )
        else:
            ok = actual == expected
    elif op == "allFilesSpecified":
        ok = (
            exists
            and isinstance(actual, list)
            and isinstance(expected, list)
            and all(x in actual for x in expected)
        )
    elif op == "matchesSchema":
        ok = (
            exists
            and schema_store is not None
            and isinstance(expected, str)
            and not schema_store.validate(expected, actual)
        )
    elif op == "edgeExists":
        if graph is None:
            ok = False
        else:
            from_node = assertion.get("from") or (expected.get("from") if isinstance(expected, dict) else None)
            to_node = assertion.get("to") or (expected.get("to") if isinstance(expected, dict) else None)
            artifact = assertion.get("artifact") or (expected.get("artifact") if isinstance(expected, dict) else None)
            edges = graph.get("edges", [])
            ok = any(
                e.get("from") == from_node
                and e.get("to") == to_node
                and (artifact is None or e.get("artifact") == artifact)
                for e in edges
            )
            actual = ok
    else:
        raise ValueError(op)

    return {
        "assertion_id": assertion_id,
        "expected": expected,
        "actual": actual,
        "satisfied": bool(ok),
    }


def run_plan_assertion(plan_assertion: dict, bundle: dict, graph=None):
    aid = plan_assertion.get("id") or plan_assertion.get("assertion_id", "")
    kind = plan_assertion.get("kind")
    subject_id = plan_assertion.get("subjectId")
    expected_admission = plan_assertion.get("expectedAdmission", "Valid")
    expected_route = plan_assertion.get("expectedRoute", "Researcher")
    expected_planner_review = plan_assertion.get("expectedPlannerReview", "PASSED")
    evidence_source_ids = plan_assertion.get("evidenceSourceIds", [])

    satisfied = True
    details: dict[str, Any] = {}

    evidence_items = bundle.get("researcher", {}).get("evidence", [])
    evidence_sources = {e.get("source") for e in evidence_items if isinstance(e, dict)}

    # Check evidence sources
    for esid in evidence_source_ids:
        if esid not in evidence_sources and not any(esid in str(s) for s in evidence_sources):
            satisfied = False

    if kind == "REQUIRED_RECORD_PRESENT":
        if subject_id == "researchBundle":
            satisfied = satisfied and bool(bundle.get("researcher")) and bool(bundle.get("plan"))
        else:
            satisfied = satisfied and (subject_id in bundle)
    elif kind == "DEPENDENCY_RESOLVED":
        plan_deps = bundle.get("plan", {}).get("dependencies", [])
        dep_found = any(
            (isinstance(d, dict) and (d.get("dependency_id") == subject_id or d.get("description") == subject_id or subject_id in str(d)))
            for d in plan_deps
        ) or (subject_id in evidence_sources)
        satisfied = satisfied and dep_found
    elif kind == "ROUTE_EXPECTED":
        if graph:
            edges = graph.get("edges", [])
            has_route = any(
                e.get("from") in ("Researcher", "Researcher.completedResult")
                for e in edges
            )
            satisfied = satisfied and has_route
    else:
        satisfied = False

    return {
        "id": aid,
        "kind": kind,
        "subjectId": subject_id,
        "satisfied": satisfied,
        "expectedPlannerReview": expected_planner_review,
        "expectedRoute": expected_route,
        "expectedAdmission": expected_admission,
    }


def run_fixture(
    fixture: dict,
    plan: dict,
    schema_store=None,
    graph=None,
    assertion_ids: list[str] | None = None,
):
    pas = fixture.get("plan_assertions") or fixture.get("planAssertions", [])
    id_key = "assertion_id" if pas and "assertion_id" in pas[0] else "id"
    wanted = assertion_ids or [a.get(id_key) for a in pas]
    by_id = {a.get(id_key): a for a in pas}
    results = []
    for aid in wanted:
        if aid not in by_id:
            results.append(
                {
                    "assertion_id": aid,
                    "expected": None,
                    "actual": None,
                    "satisfied": False,
                }
            )
        else:
            item = by_id[aid]
            if "operator" in item:
                results.append(run_assertion(item, plan, schema_store, graph))
            elif "kind" in item:
                results.append(run_plan_assertion(item, plan, graph))
            else:
                results.append(run_assertion(item, plan, schema_store, graph))
    return results, all(r.get("satisfied", False) for r in results)
