#!/usr/bin/env bash
set -euo pipefail

REPO="patriotnewsactivism/ChatScream"
SERVICE="${CLOUD_RUN_SERVICE:-chatscream-backend}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
POOL="chatscream-github"
PROVIDER="chatscream-main"
OPS_SA_NAME="chatscream-cloud-ops"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null || fail "gcloud is required. Run this from Google Cloud Shell."

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
[ -n "$ACCOUNT" ] || fail "No active Google account in Cloud Shell."
say "Using Google account: $ACCOUNT"

find_project() {
  local candidate current
  if [ -n "${GCP_PROJECT_ID:-}" ]; then
    printf '%s' "$GCP_PROJECT_ID"
    return
  fi

  current="$(gcloud config get-value project 2>/dev/null || true)"
  if [ -n "$current" ] && [ "$current" != "(unset)" ]; then
    if gcloud run services describe "$SERVICE" --region "$REGION" --project "$current" >/dev/null 2>&1; then
      printf '%s' "$current"
      return
    fi
  fi

  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if gcloud run services describe "$SERVICE" --region "$REGION" --project "$candidate" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return
    fi
  done < <(gcloud projects list --format='value(projectId)')

  # Fall back to the OAuth project if the backend service cannot be discovered.
  if gcloud projects describe chat-scream >/dev/null 2>&1; then
    printf '%s' 'chat-scream'
    return
  fi
  if gcloud projects describe chatscream >/dev/null 2>&1; then
    printf '%s' 'chatscream'
    return
  fi
  return 1
}

PROJECT_ID="$(find_project || true)"
[ -n "$PROJECT_ID" ] || fail "Could not find the Google Cloud project."
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')"
OPS_SA="${OPS_SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

say "Target project: $PROJECT_ID ($PROJECT_NUMBER)"
gcloud config set project "$PROJECT_ID" >/dev/null

say "Enabling only the APIs required for chat-driven Cloud Run administration"
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  run.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$PROJECT_ID" --quiet

if ! gcloud iam service-accounts describe "$OPS_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  say "Creating limited cloud-ops service account"
  gcloud iam service-accounts create "$OPS_SA_NAME" \
    --display-name="ChatScream GitHub Cloud Ops" \
    --project "$PROJECT_ID"
fi

say "Granting deployment and secret-management roles"
for role in \
  roles/run.admin \
  roles/secretmanager.admin \
  roles/artifactregistry.writer \
  roles/logging.viewer; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:${OPS_SA}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

# If the live Cloud Run service exists, allow the ops identity to deploy revisions
# that use its runtime service account without granting broad project-level Owner.
RUNTIME_SA="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$PROJECT_ID" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [ -z "$RUNTIME_SA" ]; then
  RUNTIME_SA="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
if gcloud iam service-accounts describe "$RUNTIME_SA" --project "$PROJECT_ID" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
    --member="serviceAccount:${OPS_SA}" \
    --role=roles/iam.serviceAccountUser \
    --quiet >/dev/null
fi

if ! gcloud iam workload-identity-pools describe "$POOL" --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
  say "Creating GitHub workload identity pool"
  gcloud iam workload-identity-pools create "$POOL" \
    --location=global \
    --display-name="ChatScream GitHub" \
    --project "$PROJECT_ID"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --workload-identity-pool="$POOL" --location=global --project "$PROJECT_ID" >/dev/null 2>&1; then
  say "Creating GitHub OIDC provider restricted to $REPO"
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --workload-identity-pool="$POOL" \
    --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}'" \
    --project "$PROJECT_ID"
fi

MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}"
gcloud iam service-accounts add-iam-policy-binding "$OPS_SA" \
  --member="$MEMBER" \
  --role=roles/iam.workloadIdentityUser \
  --quiet >/dev/null

PROVIDER_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
mkdir -p ops/control-plane
cat > ops/control-plane/wif-config.env <<EOF
GCP_PROJECT_ID=${PROJECT_ID}
GCP_PROJECT_NUMBER=${PROJECT_NUMBER}
GCP_WIF_PROVIDER=${PROVIDER_RESOURCE}
GCP_WIF_SERVICE_ACCOUNT=${OPS_SA}
CLOUD_RUN_SERVICE=${SERVICE}
CLOUD_RUN_REGION=${REGION}
EOF

say "BOOTSTRAP COMPLETE"
printf '\nCopy the block below back into ChatGPT. It contains NO secret keys:\n\n'
cat ops/control-plane/wif-config.env
printf '\nNo Google service-account key was created. GitHub will authenticate with short-lived OIDC credentials.\n'
