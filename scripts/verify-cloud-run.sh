#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=us-central1}"
: "${SERVICE:=oneshot}"
: "${SECRET_NAME:=oneshot-api-token}"

gcloud config set project "$PROJECT_ID" >/dev/null

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
REVISION="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.latestReadyRevisionName)')"
RUNTIME_SA="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.serviceAccountName)')"
CONCURRENCY="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.containerConcurrency)')"
MIN_SCALE="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.metadata.annotations.autoscaling.knative.dev/minScale)')"
MAX_SCALE="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.metadata.annotations.autoscaling.knative.dev/maxScale)')"

CLOUD_RUN_ID_TOKEN="$(gcloud auth print-identity-token)"
ONESHOT_TOKEN="$(gcloud secrets versions access latest --secret="$SECRET_NAME")"

cleanup() {
  unset CLOUD_RUN_ID_TOKEN ONESHOT_TOKEN
}
trap cleanup EXIT

request() {
  local method="$1"
  local path="$2"
  local data="${3:-}"
  if [[ -n "$data" ]]; then
    curl -fsS -X "$method" \
      -H "X-Serverless-Authorization: Bearer ${CLOUD_RUN_ID_TOKEN}" \
      -H "Authorization: Bearer ${ONESHOT_TOKEN}" \
      -H "content-type: application/json" \
      --data "$data" \
      "${SERVICE_URL}${path}"
  else
    curl -fsS -X "$method" \
      -H "X-Serverless-Authorization: Bearer ${CLOUD_RUN_ID_TOKEN}" \
      -H "Authorization: Bearer ${ONESHOT_TOKEN}" \
      "${SERVICE_URL}${path}"
  fi
}

HEALTH="$(request GET /api/health)"
echo "SERVICE_URL=$SERVICE_URL"
echo "REVISION=$REVISION"
echo "RUNTIME_SERVICE_ACCOUNT=$RUNTIME_SA"
echo "CONCURRENCY=${CONCURRENCY:-unknown}"
echo "MIN_SCALE=${MIN_SCALE:-unknown}"
echo "MAX_SCALE=${MAX_SCALE:-unknown}"
echo "HEALTH_JSON=$HEALTH"

python - "$HEALTH" <<'PY'
import json, sys
health=json.loads(sys.argv[1])
if health.get("status") != "ok":
    raise SystemExit("ROOT_CAUSE: Cloud Run health endpoint did not return status=ok")
PY

USER_MESSAGE="Build a disposable CommonJS Node media-support utility inside the OneShot sandbox. The implementation must create media.js exporting supports(name), returning true only for .mp4 and .mp3 filenames case-insensitively. Create verify.js that checks MP4=true, MP3=true, WAV=false and prints exactly PRODUCT_VERIFY mp4=true mp3=true wav=false. The implementation plan must be executable by the sandbox: every plan step description must be a direct shell command beginning with node. Before creating files, include a node command that verifies media.js and verify.js do not exist and prints exactly BEFORE_VERIFY target_files_absent=true. The final step must run node verify.js. Do not use npm, network access, Markdown code fences, placeholders, or explanatory prose in plan step descriptions. Produce deterministic validation evidence and a final hash proof."
PAYLOAD="$(python - "$USER_MESSAGE" <<'PY'
import json, sys
print(json.dumps({"message": sys.argv[1]}, separators=(",", ":")))
PY
)"
echo "CLOUD_SESSION_INPUT_JSON=$PAYLOAD"

CONVERSATION="$(request POST /api/conversations "$PAYLOAD")"
echo "CLOUD_CONVERSATION_JSON=$CONVERSATION"
CID="$(python - "$CONVERSATION" <<'PY'
import json, sys, urllib.parse
print(urllib.parse.quote(json.loads(sys.argv[1])["conversation_id"], safe=""))
PY
)"

PROMPT_RESPONSE="$(request POST "/api/conversations/${CID}/prompt")"
echo "CLOUD_HTTP_PROMPT_RESPONSE_JSON=$PROMPT_RESPONSE"

STARTED="$(request POST "/api/conversations/${CID}/run")"
echo "CLOUD_RUN_CREATED_JSON=$STARTED"
RUN_ID="$(python - "$STARTED" <<'PY'
import json, sys, urllib.parse
print(urllib.parse.quote(json.loads(sys.argv[1])["run_id"], safe=""))
PY
)"

FINAL=""
for _ in $(seq 1 1200); do
  SNAPSHOT="$(request GET "/api/runs/${RUN_ID}")"
  DONE="$(python - "$SNAPSHOT" <<'PY'
import json, sys
print("yes" if json.loads(sys.argv[1]).get("result") else "no")
PY
)"
  if [[ "$DONE" == "yes" ]]; then
    FINAL="$SNAPSHOT"
    break
  fi
  sleep 1
done

if [[ -z "$FINAL" ]]; then
  echo "ROOT_CAUSE: Cloud Run session did not reach a terminal response"
  exit 41
fi

echo "CLOUD_SESSION_FINAL_JSON=$FINAL"
TASK="$(request GET "/api/runs/${RUN_ID}/task")"
echo "CLOUD_TASK_FINAL_JSON=$TASK"

python - "$FINAL" <<'PY'
import json, sys
snapshot=json.loads(sys.argv[1])
if snapshot.get("result") != "PASSED":
    raise SystemExit("ROOT_CAUSE: live Cloud Run session terminal result=" + str(snapshot.get("result")))
proof=snapshot.get("hash_proof") or {}
if not proof.get("equal") or proof.get("created_hash") != proof.get("recomputed_hash"):
    raise SystemExit("ROOT_CAUSE: final hash equality proof failed")
processors={e.get("processor") for e in snapshot.get("events",[]) if e.get("state")=="COMPLETE"}
required={"Researcher","Planner","Refactor","GapAnalysis","Evaluation","SchemaValidation","FixtureValidation","GoalValidation","TripleValidation","Confirmed","CreateHash","Builder","Hash","Done"}
missing=sorted(required-processors)
if missing:
    raise SystemExit("ROOT_CAUSE: missing COMPLETE workflow processors: " + ",".join(missing))
print("CLOUD_FULL_SESSION_E2E=PASSED")
print("CLOUD_FINAL_RUN_ID=" + snapshot["run_id"])
print("CLOUD_FINAL_EVENT_COUNT=" + str(len(snapshot.get("events",[]))))
PY
