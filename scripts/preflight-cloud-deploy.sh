#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=us-central1}"
: "${SERVICE:=oneshot}"
: "${RUNTIME_SA_NAME:=oneshot-runtime}"
: "${SECRET_NAME:=oneshot-api-token}"
: "${ONESHOT_RESEARCH_PROVIDER:=adk_gemma2}"
: "${COMPLIANCE_PROVIDER_PATH:=backend/role/researcher/provider/adk-gemma2/worker.py}"

command -v gcloud >/dev/null || { echo "ROOT_CAUSE: gcloud not installed"; exit 10; }
command -v grep >/dev/null || { echo "ROOT_CAUSE: grep not installed"; exit 11; }

gcloud config set project "$PROJECT_ID" >/dev/null

CURRENT_SHA="$(git rev-parse HEAD 2>/dev/null || true)"
echo "REPO_HEAD=${CURRENT_SHA:-unknown}"

if [[ ! -e "$COMPLIANCE_PROVIDER_PATH" ]]; then
  echo "ROOT_CAUSE: compliance provider path does not exist: $COMPLIANCE_PROVIDER_PATH"
  exit 19
fi

if grep -R -q --fixed-strings 'ollama_chat/' "$COMPLIANCE_PROVIDER_PATH" 2>/dev/null; then
  echo "ROOT_CAUSE: selected compliance provider still contains Ollama transport."
  exit 20
fi

if grep -R -q -E 'qwen2\.5|smollm2' "$COMPLIANCE_PROVIDER_PATH" 2>/dev/null; then
  echo "ROOT_CAUSE: selected compliance provider still contains non-Gemini live bindings."
  exit 21
fi

for model in gemini-3.5-flash-lite gemini-3.6-flash gemini-3.7-flash; do
  if ! grep -R -q --fixed-strings "$model" "$COMPLIANCE_PROVIDER_PATH" .github/workflows 2>/dev/null; then
    echo "ROOT_CAUSE: target model binding not found in selected compliance path/workflow: $model"
    exit 22
  fi
done

echo "CLOUD_DEPLOY_PREFLIGHT=PASSED"
echo "PROJECT_ID=$PROJECT_ID"
echo "REGION=$REGION"
echo "SERVICE=$SERVICE"
echo "ONESHOT_RESEARCH_PROVIDER=$ONESHOT_RESEARCH_PROVIDER"
echo "COMPLIANCE_PROVIDER_PATH=$COMPLIANCE_PROVIDER_PATH"
echo "RUNTIME_SA=${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
echo "SECRET_NAME=$SECRET_NAME"
