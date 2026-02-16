#!/usr/bin/env bash
set -euo pipefail

# Production environment bootstrap for current backend deployment.

echo "========================================"
echo "ChatScream Production Environment Setup"
echo "========================================"
echo

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is required. Install Google Cloud SDK first."
  exit 1
fi

PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"

gcloud config set project "$PROJECT_ID" >/dev/null

echo "Project: $PROJECT_ID"

echo
if [[ -f ".env.production" ]]; then
  read -r -p ".env.production already exists. Overwrite? (y/N): " overwrite
  if [[ ! "$overwrite" =~ ^[Yy]$ ]]; then
    echo "Keeping existing .env.production"
  else
    cp .env.production.example .env.production
    echo "Recreated .env.production from template"
  fi
else
  cp .env.production.example .env.production
  echo "Created .env.production from template"
fi

echo
echo "Set runtime secrets in Secret Manager (recommended):"
echo "  ./infrastructure/setup-secrets.sh $PROJECT_ID"
echo
echo "Then deploy:"
echo "  ./scripts/deploy-production.sh"
