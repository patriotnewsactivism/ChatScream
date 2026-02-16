#!/usr/bin/env bash
# =============================================================================
# ChatScream - Cloud Run Deployment
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"
REGION="${GCLOUD_RUN_REGION:-${GCLOUD_REGION:-us-central1}}"
SERVICE_NAME="${CLOUD_RUN_SERVICE:-chatscream-app}"
DEPLOY_TARGET="${1:-all}" # all | deploy

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - Cloud Run Deploy        ${NC}"
echo -e "${BLUE}========================================${NC}"
echo "Project: $PROJECT_ID"
echo "Region:  $REGION"
echo "Service: $SERVICE_NAME"
echo "Target:  $DEPLOY_TARGET"
echo

if ! command -v gcloud >/dev/null 2>&1; then
  echo -e "${RED}[ERR]${NC} gcloud is required"
  exit 1
fi

gcloud config set project "$PROJECT_ID" >/dev/null

if [[ "$DEPLOY_TARGET" == "all" ]]; then
  echo -e "${BLUE}[1/2] Build frontend${NC}"
  cd "$PROJECT_ROOT"
  npm install
  npm run build
  echo -e "${GREEN}[OK]${NC} Build complete"
  echo
fi

echo -e "${BLUE}[2/2] Deploy to Cloud Run${NC}"
cd "$PROJECT_ROOT"

DEPLOY_ARGS=(
  run deploy "$SERVICE_NAME"
  --source .
  --region "$REGION"
  --allow-unauthenticated
  --set-env-vars "NODE_ENV=production"
)

# Optional secret bindings for runtime env vars.
# Example:
# export RUN_SECRETS="STRIPE_SECRET_KEY=STRIPE_SECRET_KEY:latest,CLAUDE_API_KEY=CLAUDE_API_KEY:latest"
if [[ -n "${RUN_SECRETS:-}" ]]; then
  DEPLOY_ARGS+=(--set-secrets "$RUN_SECRETS")
fi

gcloud "${DEPLOY_ARGS[@]}"

URL="$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')"

echo
echo -e "${GREEN}[OK]${NC} Deployment complete"
echo "Service URL: $URL"

