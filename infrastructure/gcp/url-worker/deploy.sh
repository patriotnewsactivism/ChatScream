#!/usr/bin/env bash
# Build and register the ChatScream URL-to-Live worker as a Cloud Run Job.
#
# Idempotent: re-running deploys a new image and updates the existing job.
# It never starts an execution — the backend does that per broadcast.
set -euo pipefail

PROJECT_ID="${PROJECT_ID:-chat-scream}"
REGION="${REGION:-us-central1}"
JOB_NAME="${JOB_NAME:-chatscream-url-worker}"
REPO="${REPO:-chatscream}"
SERVICE_ACCOUNT="${SERVICE_ACCOUNT:-chatscream-url-worker@${PROJECT_ID}.iam.gserviceaccount.com}"
IMAGE="${REGION}-docker.pkg.dev/${PROJECT_ID}/${REPO}/url-worker:$(date +%Y%m%d-%H%M%S)"

echo "==> project=${PROJECT_ID} region=${REGION} job=${JOB_NAME}"

# Artifact Registry repo (safe to re-run).
if ! gcloud artifacts repositories describe "${REPO}" \
      --project "${PROJECT_ID}" --location "${REGION}" >/dev/null 2>&1; then
  echo "==> creating Artifact Registry repo ${REPO}"
  gcloud artifacts repositories create "${REPO}" \
    --project "${PROJECT_ID}" --location "${REGION}" \
    --repository-format=docker \
    --description="ChatScream container images"
fi

# Runtime identity for the worker. It needs no GCP permissions at all: it pulls
# a public URL and posts back to the ChatScream API with a bearer token, so the
# account exists purely to avoid inheriting the default compute SA's scopes.
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT}" \
      --project "${PROJECT_ID}" >/dev/null 2>&1; then
  echo "==> creating service account ${SERVICE_ACCOUNT}"
  gcloud iam service-accounts create "$(echo "${SERVICE_ACCOUNT}" | cut -d@ -f1)" \
    --project "${PROJECT_ID}" \
    --display-name="ChatScream URL-to-Live worker"
fi

echo "==> building ${IMAGE}"
gcloud builds submit "$(dirname "$0")" \
  --project "${PROJECT_ID}" \
  --tag "${IMAGE}"

# 2 vCPU / 2Gi comfortably carries a single 1080p x264 veryfast encode.
# max-retries=0: a live broadcast that died is over — silently restarting it
# would push a second stream at the destinations minutes after the fact.
COMMON_ARGS=(
  --project "${PROJECT_ID}"
  --region "${REGION}"
  --image "${IMAGE}"
  --service-account "${SERVICE_ACCOUNT}"
  --cpu 2
  --memory 2Gi
  --max-retries 0
  --task-timeout 24h
  --parallelism 1
  --tasks 1
)

if gcloud run jobs describe "${JOB_NAME}" \
     --project "${PROJECT_ID}" --region "${REGION}" >/dev/null 2>&1; then
  echo "==> updating job ${JOB_NAME}"
  gcloud run jobs update "${JOB_NAME}" "${COMMON_ARGS[@]}"
else
  echo "==> creating job ${JOB_NAME}"
  gcloud run jobs create "${JOB_NAME}" "${COMMON_ARGS[@]}"
fi

cat <<EOF

==> done

Set these on the ChatScream backend (Cloud Run service):

  GCP_PROJECT_ID=${PROJECT_ID}
  CLOUD_RUN_JOB_REGION=${REGION}
  CLOUD_RUN_JOB_NAME=${JOB_NAME}
  CLOUD_WORKER_CALLBACK_URL=https://api.chatscream.live

The backend's own service account needs run.jobs.run and run.executions.* on
this job:

  gcloud run jobs add-iam-policy-binding ${JOB_NAME} \\
    --project ${PROJECT_ID} --region ${REGION} \\
    --member serviceAccount:<BACKEND_SA> \\
    --role roles/run.invoker
EOF
