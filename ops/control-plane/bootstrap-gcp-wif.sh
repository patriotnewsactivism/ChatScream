#!/usr/bin/env bash
set -euo pipefail

# One-time ChatScream Google Cloud bootstrap.
# Run from Google Cloud Shell while signed into the Google account that owns the
# ChatScream projects. No service-account key is created or downloaded.

REPO="patriotnewsactivism/ChatScream"
SERVICE="${CLOUD_RUN_SERVICE:-chatscream-backend}"
REGION="${CLOUD_RUN_REGION:-us-central1}"
CONTROL_PROJECT="chat-scream"
CONTROL_PROJECT_NUMBER="584450564662"
POOL="chatscream-github"
PROVIDER="chatscream-main"
OPS_SA_NAME="chatscream-cloud-ops"
OPS_SA="${OPS_SA_NAME}@${CONTROL_PROJECT}.iam.gserviceaccount.com"
RAW_BASE="https://raw.githubusercontent.com/patriotnewsactivism/ChatScream/main/ops/control-plane/bootstrap"
GOOGLE_CLIENT_ID="584450564662-vvlnooo2oe25ltstet0mkqajm4ta80d8.apps.googleusercontent.com"
YOUTUBE_CLIENT_ID="584450564662-ek0a4ibt01t9ho6guc7sfqp59dq0vrs5.apps.googleusercontent.com"

say() { printf '\n==> %s\n' "$*"; }
fail() { printf '\nERROR: %s\n' "$*" >&2; exit 1; }

command -v gcloud >/dev/null || fail "gcloud is required. Run this from Google Cloud Shell."
command -v openssl >/dev/null || fail "openssl is required."
command -v curl >/dev/null || fail "curl is required."

ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
[ -n "$ACCOUNT" ] || fail "No active Google account in Cloud Shell."
[ -n "${CHATSCREAM_BOOTSTRAP_KEY:-}" ] || fail "CHATSCREAM_BOOTSTRAP_KEY is missing. Use the one-command bootstrap supplied in ChatGPT."

say "Using Google account: $ACCOUNT"
gcloud projects describe "$CONTROL_PROJECT" >/dev/null 2>&1 || fail "This Google account cannot access project ${CONTROL_PROJECT}."

find_target_project() {
  local candidate current
  if [ -n "${GCP_PROJECT_ID:-}" ]; then
    printf '%s' "$GCP_PROJECT_ID"
    return
  fi
  current="$(gcloud config get-value project 2>/dev/null || true)"
  if [ -n "$current" ] && [ "$current" != "(unset)" ] && \
     gcloud run services describe "$SERVICE" --region "$REGION" --project "$current" >/dev/null 2>&1; then
    printf '%s' "$current"
    return
  fi
  while IFS= read -r candidate; do
    [ -n "$candidate" ] || continue
    if gcloud run services describe "$SERVICE" --region "$REGION" --project "$candidate" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return
    fi
  done < <(gcloud projects list --format='value(projectId)')

  # Last-resort known candidates.
  for candidate in chatscream chat-scream; do
    if gcloud projects describe "$candidate" >/dev/null 2>&1; then
      printf '%s' "$candidate"
      return
    fi
  done
  return 1
}

TARGET_PROJECT="$(find_target_project || true)"
[ -n "$TARGET_PROJECT" ] || fail "Could not identify the ChatScream Google Cloud project."
TARGET_PROJECT_NUMBER="$(gcloud projects describe "$TARGET_PROJECT" --format='value(projectNumber)')"

say "Control project: ${CONTROL_PROJECT} (${CONTROL_PROJECT_NUMBER})"
say "Cloud Run target: ${TARGET_PROJECT} (${TARGET_PROJECT_NUMBER})"

say "Enabling the APIs required for keyless GitHub administration"
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project "$CONTROL_PROJECT" --quiet

gcloud services enable \
  run.googleapis.com \
  secretmanager.googleapis.com \
  artifactregistry.googleapis.com \
  --project "$TARGET_PROJECT" --quiet

if ! gcloud iam service-accounts describe "$OPS_SA" --project "$CONTROL_PROJECT" >/dev/null 2>&1; then
  say "Creating limited cloud-ops service account"
  gcloud iam service-accounts create "$OPS_SA_NAME" \
    --display-name="ChatScream GitHub Cloud Ops" \
    --project "$CONTROL_PROJECT"
fi

say "Granting only the roles needed to deploy ChatScream and manage its secrets"
for role in \
  roles/run.admin \
  roles/secretmanager.admin \
  roles/artifactregistry.writer \
  roles/logging.viewer \
  roles/serviceusage.serviceUsageConsumer; do
  gcloud projects add-iam-policy-binding "$TARGET_PROJECT" \
    --member="serviceAccount:${OPS_SA}" \
    --role="$role" \
    --condition=None \
    --quiet >/dev/null
done

RUNTIME_SA="$(gcloud run services describe "$SERVICE" --region "$REGION" --project "$TARGET_PROJECT" --format='value(spec.template.spec.serviceAccountName)' 2>/dev/null || true)"
if [ -z "$RUNTIME_SA" ]; then
  RUNTIME_SA="${TARGET_PROJECT_NUMBER}-compute@developer.gserviceaccount.com"
fi
if gcloud iam service-accounts describe "$RUNTIME_SA" --project "$TARGET_PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts add-iam-policy-binding "$RUNTIME_SA" \
    --project "$TARGET_PROJECT" \
    --member="serviceAccount:${OPS_SA}" \
    --role=roles/iam.serviceAccountUser \
    --quiet >/dev/null
fi

if ! gcloud iam workload-identity-pools describe "$POOL" --location=global --project "$CONTROL_PROJECT" >/dev/null 2>&1; then
  say "Creating GitHub workload identity pool"
  gcloud iam workload-identity-pools create "$POOL" \
    --location=global \
    --display-name="ChatScream GitHub" \
    --project "$CONTROL_PROJECT"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
    --workload-identity-pool="$POOL" --location=global --project "$CONTROL_PROJECT" >/dev/null 2>&1; then
  say "Creating GitHub OIDC provider restricted to ${REPO}"
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --workload-identity-pool="$POOL" \
    --location=global \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.repository=assertion.repository,attribute.ref=assertion.ref" \
    --attribute-condition="assertion.repository=='${REPO}'" \
    --project "$CONTROL_PROJECT"
fi

MEMBER="principalSet://iam.googleapis.com/projects/${CONTROL_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${REPO}"
gcloud iam service-accounts add-iam-policy-binding "$OPS_SA" \
  --project "$CONTROL_PROJECT" \
  --member="$MEMBER" \
  --role=roles/iam.workloadIdentityUser \
  --quiet >/dev/null

say "Decrypting the two one-time OAuth envelopes locally inside Cloud Shell"
decrypt_remote() {
  local filename="$1"
  curl -fsSL "${RAW_BASE}/${filename}" | \
    openssl enc -d -aes-256-cbc -a -A -pbkdf2 -iter 200000 -md sha256 \
      -pass env:CHATSCREAM_BOOTSTRAP_KEY
}
GOOGLE_CLIENT_SECRET_VALUE="$(decrypt_remote google_client_secret.enc)"
YOUTUBE_CLIENT_SECRET_VALUE="$(decrypt_remote youtube_client_secret.enc)"
[ -n "$GOOGLE_CLIENT_SECRET_VALUE" ] || fail "Google OAuth secret failed to decrypt."
[ -n "$YOUTUBE_CLIENT_SECRET_VALUE" ] || fail "YouTube OAuth secret failed to decrypt."

say "Writing OAuth secrets into Google Secret Manager"
ensure_secret() {
  local name="$1" value="$2"
  if ! gcloud secrets describe "$name" --project "$TARGET_PROJECT" >/dev/null 2>&1; then
    gcloud secrets create "$name" --replication-policy=automatic --project "$TARGET_PROJECT" --quiet
  fi
  printf '%s' "$value" | gcloud secrets versions add "$name" --data-file=- --project "$TARGET_PROJECT" --quiet >/dev/null
  gcloud secrets add-iam-policy-binding "$name" \
    --project "$TARGET_PROJECT" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role=roles/secretmanager.secretAccessor \
    --quiet >/dev/null
}
ensure_secret chatscream-google-client-secret "$GOOGLE_CLIENT_SECRET_VALUE"
ensure_secret chatscream-youtube-client-secret "$YOUTUBE_CLIENT_SECRET_VALUE"

say "Updating Cloud Run with separate Google and YouTube credential pairs"
gcloud run services update "$SERVICE" \
  --region "$REGION" \
  --project "$TARGET_PROJECT" \
  --update-env-vars "GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID},YOUTUBE_CLIENT_ID=${YOUTUBE_CLIENT_ID}" \
  --update-secrets "GOOGLE_CLIENT_SECRET=chatscream-google-client-secret:latest,YOUTUBE_CLIENT_SECRET=chatscream-youtube-client-secret:latest" \
  --quiet

unset GOOGLE_CLIENT_SECRET_VALUE YOUTUBE_CLIENT_SECRET_VALUE CHATSCREAM_BOOTSTRAP_KEY

say "Verifying the live API"
curl -fsS --max-time 30 https://api.chatscream.live/api/health >/dev/null || \
  printf 'Warning: API health probe did not return success yet. Check the new Cloud Run revision.\n'

cat <<EOF

BOOTSTRAP COMPLETE

GitHub -> Google authentication is now keyless (OIDC), and the OAuth secrets are in Secret Manager.
Safe controller identity:
  workload_identity_provider=projects/${CONTROL_PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}
  service_account=${OPS_SA}
  target_project=${TARGET_PROJECT}
  service=${SERVICE}
  region=${REGION}

You can close Cloud Shell. No long-lived Google service-account key was created.
EOF
