#!/usr/bin/env python3
"""Read-only inventory of branch publication and integration against origin/main.

Fetch first. This command never merges, pushes, deletes, or examines secret files.
Checkpoint/stash refs are intentionally excluded from branch publication checks.
"""
from __future__ import annotations

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def git(*args: str) -> str:
    return subprocess.check_output(["git", *args], cwd=ROOT, text=True, encoding="utf-8").strip()


def main() -> None:
    base = "refs/remotes/origin/main"
    branches = []
    for row in git("for-each-ref", "--format=%(refname)|%(objectname)|%(symref)", "refs/heads", "refs/remotes/origin").splitlines():
        ref, sha, symbolic = row.split("|", 2)
        if symbolic:
            continue
        behind, ahead = map(int, git("rev-list", "--left-right", "--count", f"{base}...{ref}").split())
        local = ref.startswith("refs/heads/")
        unpublished = int(git("rev-list", "--count", ref, "--not", "--remotes=origin")) if local else 0
        branches.append({
            "ref": ref, "sha": sha, "main_only_commits": behind,
            "branch_only_commits": ahead, "unpublished_commits": unpublished,
            "integrated_by_ancestry": ahead == 0,
            "patch_distinct_nonmerge_commits": git("log", "--cherry-pick", "--right-only", "--no-merges", "--format=%h %s", f"{base}...{ref}").splitlines() if ahead else [],
        })
    print(json.dumps({
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "main_sha": git("rev-parse", base),
        "all_local_branch_commits_published": all(b["unpublished_commits"] == 0 for b in branches),
        "note": "Ancestry and patch identity do not prove semantic equivalence or runtime quality.",
        "branches": branches,
    }, indent=2))


if __name__ == "__main__":
    main()
