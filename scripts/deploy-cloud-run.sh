#!/usr/bin/env bash
set -euo pipefail

: "${PROJECT_ID:?set PROJECT_ID}"
: "${REGION:=us-central1}"
: "${SERVICE:=oneshot}"
: "${RUNTIME_SA_NAME:=oneshot-runtime}"
: "${SECRET_NAME:=oneshot-api-token}"
: "${ONESHOT_RESEARCH_PROVIDER:=adk_gemma2}"
: "${COMPLIANCE_PROVIDER_PATH:=backend/role/researcher/provider/adk-gemma2/worker.py}"

RUNTIME_SA="${RUNTIME_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

"$(dirname "$0")/preflight-cloud-deploy.sh"

gcloud config set project "$PROJECT_ID"

gcloud services enable \
  run.googleapis.com \
  aiplatform.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com

if ! gcloud iam service-accounts describe "$RUNTIME_SA" >/dev/null 2>&1; then
  gcloud iam service-accounts create "$RUNTIME_SA_NAME" \
    --display-name="OneShot Cloud Run runtime"
fi

gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/aiplatform.user" >/dev/null

if ! gcloud secrets describe "$SECRET_NAME" >/dev/null 2>&1; then
  command -v openssl >/dev/null || {
    echo "ROOT_CAUSE: openssl required to create initial OneShot API token secret"
    exit 30
  }
  openssl rand -hex 32 | tr -d '\n' | \
    gcloud secrets create "$SECRET_NAME" \
      --data-file=- \
      --replication-policy=automatic
fi

gcloud secrets add-iam-policy-binding "$SECRET_NAME" \
  --member="serviceAccount:$RUNTIME_SA" \
  --role="roles/secretmanager.secretAccessor" >/dev/null

gcloud run deploy "$SERVICE" \
  --source . \
  --region "$REGION" \
  --service-account "$RUNTIME_SA" \
  --no-allow-unauthenticated \
  --no-cpu-throttling \
  --set-env-vars="ONESHOT_MODE=production,ONESHOT_BIND_HOST=0.0.0.0,ONESHOT_RESEARCH_PROVIDER=${ONESHOT_RESEARCH_PROVIDER},GOOGLE_CLOUD_PROJECT=${PROJECT_ID},GOOGLE_CLOUD_LOCATION=global,GOOGLE_GENAI_USE_VERTEXAI=True,GEMINI_DISTRIBUTION_MODEL=gemini-3.5-flash-lite,GEMINI_RESEARCH_MODEL=gemini-3.6-flash,GEMINI_SYNTHESIS_MODEL=gemini-3.7-flash" \
  --set-secrets="ONESHOT_API_TOKEN=${SECRET_NAME}:latest"

# Proof-mode constraint only. Current local file stores are not multi-instance durable.
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --concurrency 1 \
  --min 1 \
  --max 1 \
  --no-cpu-throttling

SERVICE_URL="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')"
REVISION="$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.latestReadyRevisionName)')"

echo "CLOUD_RUN_DEPLOYED=true"
echo "SERVICE_URL=$SERVICE_URL"
echo "REVISION=$REVISION"
echo "RUNTIME_SERVICE_ACCOUNT=$RUNTIME_SA"
echo "NEXT: run scripts/verify-cloud-run.sh with the same PROJECT_ID/REGION/SERVICE."
