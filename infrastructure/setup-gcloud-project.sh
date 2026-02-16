#!/usr/bin/env bash
# =============================================================================
# ChatScream - Google Cloud Project Setup
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"
PROJECT_NAME="${GCLOUD_PROJECT_NAME:-ChatScream}"
BILLING_ACCOUNT="${GCLOUD_BILLING_ACCOUNT:-}"
REGION="${GCLOUD_REGION:-us-central1}"
RUN_REGION="${GCLOUD_RUN_REGION:-$REGION}"
ZONE="${GCLOUD_ZONE:-us-central1-a}"

say_ok() { echo -e "${GREEN}[OK]${NC} $1"; }
say_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
say_err() { echo -e "${RED}[ERR]${NC} $1"; }

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    say_err "Missing required command: $1"
    exit 1
  fi
}

require_cmd gcloud

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - GCloud Infrastructure   ${NC}"
echo -e "${BLUE}========================================${NC}"
echo

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1 || true)"
if [[ -z "$ACTIVE_ACCOUNT" ]]; then
  say_warn "No active gcloud account found. Opening login flow..."
  gcloud auth login
fi

ACTIVE_ACCOUNT="$(gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -n1)"
say_ok "Authenticated as $ACTIVE_ACCOUNT"

if gcloud projects describe "$PROJECT_ID" >/dev/null 2>&1; then
  say_ok "Project exists: $PROJECT_ID"
else
  say_warn "Creating project: $PROJECT_ID"
  gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
  say_ok "Project created"
fi

gcloud config set project "$PROJECT_ID" >/dev/null
say_ok "Project set: $PROJECT_ID"

if [[ -n "$BILLING_ACCOUNT" ]]; then
  gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
  say_ok "Billing linked: $BILLING_ACCOUNT"
else
  say_warn "GCLOUD_BILLING_ACCOUNT not set. Paid resources may fail until billing is linked."
fi

echo
say_ok "Enabling APIs"
APIS=(
  "compute.googleapis.com"
  "run.googleapis.com"
  "cloudbuild.googleapis.com"
  "artifactregistry.googleapis.com"
  "secretmanager.googleapis.com"
  "storage.googleapis.com"
  "iam.googleapis.com"
  "logging.googleapis.com"
  "monitoring.googleapis.com"
)
for api in "${APIS[@]}"; do
  echo "  enabling $api"
  gcloud services enable "$api" --quiet

done
say_ok "APIs enabled"

gcloud config set compute/region "$REGION" >/dev/null
gcloud config set compute/zone "$ZONE" >/dev/null
gcloud config set run/region "$RUN_REGION" >/dev/null
gcloud config set run/platform managed >/dev/null
say_ok "Default region/zone configured"

SA_NAME="chatscream-app"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
if gcloud iam service-accounts describe "$SA_EMAIL" >/dev/null 2>&1; then
  say_ok "Service account exists: $SA_EMAIL"
else
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name="ChatScream Application" \
    --description="Service account for ChatScream runtime"
  say_ok "Service account created: $SA_EMAIL"
fi

ROLES=(
  "roles/run.admin"
  "roles/compute.instanceAdmin.v1"
  "roles/iam.serviceAccountUser"
  "roles/secretmanager.secretAccessor"
  "roles/storage.objectAdmin"
  "roles/logging.logWriter"
  "roles/monitoring.metricWriter"
)
for role in "${ROLES[@]}"; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$role" \
    --quiet >/dev/null 2>&1 || true

done
say_ok "Service account IAM roles ensured"

if gcloud compute networks describe chatscream-network >/dev/null 2>&1; then
  say_ok "VPC exists: chatscream-network"
else
  gcloud compute networks create chatscream-network \
    --subnet-mode=auto \
    --description="VPC network for ChatScream"
  say_ok "VPC created: chatscream-network"
fi

# Firewall rules for web + media ingress
for rule in chatscream-allow-http chatscream-allow-rtmp chatscream-allow-ssh chatscream-allow-webrtc; do
  if gcloud compute firewall-rules describe "$rule" >/dev/null 2>&1; then
    continue
  fi

  case "$rule" in
    chatscream-allow-http)
      gcloud compute firewall-rules create "$rule" \
        --network=chatscream-network \
        --allow=tcp:80,tcp:443 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=chatscream-vm \
        --description="Allow HTTP/HTTPS"
      ;;
    chatscream-allow-rtmp)
      gcloud compute firewall-rules create "$rule" \
        --network=chatscream-network \
        --allow=tcp:1935,tcp:1936 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=chatscream-vm \
        --description="Allow RTMP ingress"
      ;;
    chatscream-allow-ssh)
      gcloud compute firewall-rules create "$rule" \
        --network=chatscream-network \
        --allow=tcp:22 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=chatscream-vm \
        --description="Allow SSH"
      ;;
    chatscream-allow-webrtc)
      gcloud compute firewall-rules create "$rule" \
        --network=chatscream-network \
        --allow=udp:10000-60000 \
        --source-ranges=0.0.0.0/0 \
        --target-tags=chatscream-vm \
        --description="Allow WebRTC UDP"
      ;;
  esac
done
say_ok "Firewall rules ensured"

BUCKET_NAME="${PROJECT_ID}-media"
if gsutil ls "gs://${BUCKET_NAME}" >/dev/null 2>&1; then
  say_ok "Bucket exists: gs://${BUCKET_NAME}"
else
  gsutil mb -l "$REGION" "gs://${BUCKET_NAME}"
  gsutil iam ch allUsers:objectViewer "gs://${BUCKET_NAME}"
  say_ok "Bucket created: gs://${BUCKET_NAME}"
fi

echo
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}Setup Complete${NC}"
echo -e "${BLUE}========================================${NC}"
echo "Project ID:      $PROJECT_ID"
echo "Region:          $REGION"
echo "Zone:            $ZONE"
echo "Run Region:      $RUN_REGION"
echo "Service Account: $SA_EMAIL"
echo "Media Bucket:    gs://${BUCKET_NAME}"
echo
echo "Next steps:"
echo "1) ./infrastructure/create-vm.sh"
echo "2) ./infrastructure/setup-secrets.sh $PROJECT_ID"
echo "3) ./infrastructure/deploy.sh"

