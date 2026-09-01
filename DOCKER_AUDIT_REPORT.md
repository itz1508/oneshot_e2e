# OneShot Docker Audit - Corrected Report (Vulnerability Mitigation Pass)

**Date:** 2026-09-01
**Repository:** oneshot_e2e
**Branch:** main, HEAD at time of this pass: a0ae172f54d5e569e8ae2674575959164736015f (uncommitted changes on top)
**Status:** NOT_VALID (blocker: browser authentication unresolved; 2 unfixed Critical CVEs require risk acceptance)

---

## DIAGNOSIS

### Issue 1: Vulnerability Count (Corrected)

**Prior report claimed 112 total vulnerabilities. Actual rescan at start of this pass: 113.**

```text
docker scout cves oneshot:1.3.0 (image before mitigation, digest f163a0add5e6)
373 packages analyzed
113 vulnerabilities found in 30 packages
  Critical: 3   High: 18   Medium: 32   Low: 49   Unspecified: 11
```

**Critical breakdown (verified with `--only-severity critical`):**

- CVE-2026-13221 — perl 5.36.0-7+deb12u3 (Debian base) — not fixed upstream
- CVE-2026-12087 — perl 5.36.0-7+deb12u3 (Debian base) — not fixed upstream
- CVE-2026-59873 — tar 7.5.11 (npm-bundled, CVSS 9.2) — **fixed in tar 7.5.19**

### Issue 2: Root Cause of tar CVE

`docker run --rm oneshot:1.3.0 sh -c "find /usr/local/lib/node_modules/npm -iname tar -type d"` showed the vulnerable `tar@7.5.11` is bundled inside npm's own `node_modules/` as part of the `node:22-bookworm-slim` base image's global npm install — not a project dependency.

Grep across `backend/`, `validation/`, `skill/`, `workflow/` for `npm|npx|yarn|corepack` returned zero matches. The container's `CMD ["node", "dist/backend/index.js"]` never shells out to any of these tools. `container-runner.ts` and `process-runner.ts` spawn `docker`, `sh`/`cmd.exe`, and a caller-supplied Python interpreter — never npm/npx/yarn.

**Action taken:** Removed `npm`, `npx`, `yarn`, `corepack`, and their installed directories (`/usr/local/lib/node_modules/npm`, `/usr/local/lib/node_modules/corepack`, `/opt/yarn-v*`) from the **runner stage only**, in the Dockerfile, after the Python venv install step. Node.js itself (`/usr/local/bin/node`) was left untouched.

### Issue 3: Perl CVEs — No Fix Available

`perl-base` is marked `Essential: yes` in Debian and cannot be removed without risking breakage of `dpkg`/`apt` tooling inside the image. No application code invokes `perl` (verified by grep across runtime source directories). `docker scout recommendations` confirms the current `node:22-bookworm-slim` tag is already the latest available and still ships these two unfixed CVEs (the recommendation output showed the same base image, freshly pulled, still carrying `3C 11H 20M 30L 9?` at the OS layer). Rebuilding with `--pull` did not change the Perl CVE status because Debian has not shipped a fix.

**This is recorded as a required risk acceptance, not resolved.**

| Field | Value |
|---|---|
| Affected package | perl-base 5.36.0-7+deb12u3 (Debian bookworm) |
| CVEs | CVE-2026-13221, CVE-2026-12087 |
| Required at runtime? | No — not invoked by any application code path found in backend/, validation/, skill/, workflow/ |
| Exploitability in this image | Perl binary is present on disk and reachable only by a process with shell access inside the container (e.g., via the sandbox process-runner's `sh -c`, which is itself gated by the workflow/plan/authorization chain). No network-facing code path invokes perl. |
| Mitigation applied | None available upstream; package is Essential and not removed |
| Risk acceptance required | **Yes — explicit user sign-off required before this image is considered production-clean** |

---

## FILES CHANGED (This Pass)

**Dockerfile** — additional change on top of the previously committed diff:

- Added a `RUN rm -rf ...` step in the runner stage removing npm/npx/yarn/corepack and their package directories, with an inline comment recording the rationale and the grep verification.
- **Current cumulative diff vs HEAD (a0ae172):** `git diff --stat Dockerfile` reports **46 insertions, 12 deletions** (up from 30/12 before this pass, because of the newly added removal step). This number was re-measured just now, not carried forward from a prior claim.

**DOCKER_AUDIT_REPORT.md** — fully rewritten (this file) with:

- Corrected vulnerability total: 113 (not 112)
- Corrected Critical breakdown: two Perl CVEs + one npm tar CVE (not "3 Critical (Perl 5.36.0)" as previously stated — the tar CVE was previously miscategorized as Perl-only)
- tar fixability documented (7.5.19)
- Resource-limit language corrected (see below)

**BROWSER_AUTH_PROPOSAL.md** — fully rewritten with the circular bootstrap defect removed and a real credential-entry path defined (see that file).

**File sizes (re-measured, not carried forward):**

- docker-compose.yml: 53 lines
- .dockerignore: 31 lines

---

## RESOURCE LIMIT ANALYSIS (Corrected Language)

Re-verified via `docker inspect oneshot-app` on the running container at the time of this pass:

```text
Memory:            1073741824   (1 GiB limit — ENFORCED)
MemoryReservation:  268435456   (256 MiB reservation — ENFORCED)
NanoCpus:          2000000000   (2 CPUs — this is the mechanism that enforces the CPU limit)
CpuShares:                  0   (no CPU reservation evidenced — CpuShares is the field that
                                  would show a relative-weight reservation, and it reads 0)
CpuQuota:                    0   (expected: NanoCpus is the active limiting field, not CpuQuota;
                                   CpuQuota=0 does NOT disprove the NanoCpus-based limit)
```

**Corrected statement:** Memory limit and memory reservation are both enforced. The 2-CPU limit is enforced via `NanoCpus=2000000000`. CPU *reservation* (the `cpus: "0.5"` under `deploy.resources.reservations`) is **not evidenced** at runtime — `CpuShares` reads 0, and standalone Docker Compose does not translate `reservations.cpus` into a `CpuShares` value the way it does for `limits.cpus` → `NanoCpus`. This report does **not** claim all reservations are enforced — only that the memory limit, memory reservation, and CPU limit are confirmed; the CPU reservation is unconfirmed.

---

## COMMANDS RUN (This Pass)

```bash
docker scout cves oneshot:1.3.0
docker scout cves --only-severity critical --locations local://oneshot:1.3.0
docker scout cves --only-severity critical --only-fixed local://oneshot:1.3.0
docker scout recommendations local://oneshot:1.3.0
docker run --rm oneshot:1.3.0 sh -c "which npm; which npx; which yarn; which corepack; npm --version"
docker run --rm oneshot:1.3.0 sh -c "find /usr/local/lib/node_modules/npm -iname tar -type d"
# grep across backend/, validation/, skill/, workflow/ for npm|npx|yarn|corepack|perl -> zero matches
docker build --pull -t oneshot:1.3.0 .
docker run --rm oneshot:1.3.0 sh -c "node --version; which npm || echo removed; which npx || echo removed; which yarn || echo removed; which corepack || echo removed"
docker compose down
docker compose up -d --wait
python verify_docker_audit.py
docker scout cves local://oneshot:1.3.0
docker scout cves --only-severity critical local://oneshot:1.3.0
docker inspect oneshot-app --format='{{.HostConfig.Memory}} {{.HostConfig.MemoryReservation}} {{.HostConfig.NanoCpus}} {{.HostConfig.CpuShares}} {{.HostConfig.CpuQuota}}'
```

---

## VERIFICATION RESULTS (Post-Mitigation Rebuild)

### Rebuild Confirmation

```text
docker build --pull -t oneshot:1.3.0 .   -> succeeded, new image (digest changed from f163a0add5e6)
node --version inside new image          -> v22.23.2 (unchanged, confirms Node retained)
npm/npx/yarn/corepack inside new image   -> all report "removed" (absent), confirmed via `which`
```

### E2E Test Results (verify_docker_audit.py, run against rebuilt image, includes actual `docker compose restart`)

```text
[PASS] Unauthenticated API returns 401
[PASS] Authenticated API returns 200
[PASS] UI returns 200
[PASS] Authenticated workflow succeeds  (completed in 1s, 15 artifacts, hash proof equal=true)
[PASS] Persistence across restart       (39 events, 15 artifacts, identical before/after docker compose restart)

Results: 5 PASS / 0 FAIL / 0 ERROR
```

This confirms the compiled backend still starts and the full workflow still executes correctly after removing npm/npx/yarn/corepack from the runner stage.

### Vulnerability Rescan (Post-Mitigation)

```text
docker scout cves local://oneshot:1.3.0
186 packages analyzed (down from 373)
95 vulnerabilities found in 22 packages (down from 113)
  Critical: 2   High: 8   Medium: 25   Low: 49   Unspecified: 11
```

```text
docker scout cves --only-severity critical local://oneshot:1.3.0
2 vulnerabilities found in 1 package
  perl 5.36.0-7+deb12u3: CVE-2026-13221, CVE-2026-12087 (both "not fixed")
```

**Result:** The npm-bundled `tar@7.5.11` CVE (CVE-2026-59873, CVSS 9.2) is eliminated by removing npm from the runtime image — package count dropped 373→186, total vulnerabilities 113→95, Critical count 3→2. The two remaining Critical findings are both `perl-base`, unfixed upstream, and require explicit risk acceptance (see table above) — they are not resolved by this change.

### Resource Limits (Re-verified on rebuilt/restarted container)

```text
Memory:            1073741824
MemoryReservation:  268435456
NanoCpus:          2000000000
CpuShares:                  0
```

Consistent with the corrected analysis above.

---

## MANIFEST STATUS

Manifest regeneration and verification for this pass is performed **after** this report and the proposal document are finalized, per the required ordering. See the audit trail / commands log for the exact `MANIFEST_GENERATED` / `MANIFEST_VERIFIED` output captured in this same working session.

---

## COMPLIANCE MATRIX (Corrected)

| Requirement | Status | Evidence |
|---|---|---|
| Unauthenticated API = 401 | PASS | Tested against rebuilt image |
| Authenticated API = 200 | PASS | Tested against rebuilt image |
| UI returns 200 | PASS | Tested against rebuilt image |
| Authenticated workflow reaches PASSED | PASS | 1s, 15 artifacts, hash proof equal=true |
| Data persistence across `docker compose restart` | PASS | Event/artifact counts identical before/after |
| UID/GID 10001 | PASS | Unchanged by this pass; not re-verified in this section — see Phase 5 gate |
| Memory limit enforced | PASS | Memory=1073741824 |
| Memory reservation enforced | PASS | MemoryReservation=268435456 |
| CPU limit enforced | PASS | NanoCpus=2000000000 |
| CPU reservation enforced | **NOT EVIDENCED** | CpuShares=0 |
| npm-bundled tar CVE (CVE-2026-59873) | RESOLVED | npm/npx/yarn/corepack removed from runner; rescan confirms absence |
| Perl CVEs (CVE-2026-13221, CVE-2026-12087) | **UNRESOLVED — risk acceptance required** | No fix available upstream; not invoked at runtime |
| Browser authentication | **BLOCKER — unresolved** | Frontend makes unauthenticated calls; corrected proposal awaiting approval |
| Manifest integrity | Pending re-verification this pass (see below) | — |

---

## REMAINING LIMITATIONS

1. **Two unfixed Critical CVEs (Perl, Debian bookworm base).** No patched package exists. perl-base is Essential and not removed. Not invoked by any application code path identified. Requires explicit, documented risk acceptance from the user before this image can be called production-clean; this report does not claim that acceptance has been given.

2. **Browser authentication is unresolved.** The corrected proposal (BROWSER_AUTH_PROPOSAL.md) defines a real, non-circular bootstrap (server-controlled login form) but has not been approved or implemented. No backend/ or web/ source has been modified for this purpose.

3. **CPU reservation (`deploy.resources.reservations.cpus: "0.5"`) is not evidenced at runtime.** Only the CPU *limit* (NanoCpus) is confirmed. This is a narrower and more accurate claim than "all reservations enforced."

4. **No production-readiness timing claims are made in this report.** Prior reports contained unsupported estimates (e.g., "immediate," "3-5 days"); those have been removed. Timeline estimates depend on decisions (risk acceptance, auth approval) not yet made.

---

## STATUS

**NOT_VALID.**

Docker packaging itself (build, multi-stage, non-root user, resource limits as scoped above, persistence, health check) is verified working on the rebuilt image. It remains blocked from production status by:

- Two unresolved Critical CVEs requiring explicit risk acceptance, and
- Unresolved, unapproved browser authentication.

No claim of overall production readiness is made in this report.

---

**Report reflects state as of this pass. Superseded prior versions of this document are not retained separately — this is the single authoritative report.**
