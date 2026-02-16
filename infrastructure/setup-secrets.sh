#!/usr/bin/env bash
set -euo pipefail

# Configure application secrets in Google Secret Manager.
# Usage: ./infrastructure/setup-secrets.sh [project-id]

PROJECT_ID="${PROJECT_ID:-${1:-chatscream-prod}}"

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd gcloud

gcloud config set project "$PROJECT_ID" >/dev/null

echo "Target project: $PROJECT_ID"
echo "Enter secret values (input hidden). Leave blank to skip."
echo

set_secret() {
  local name="$1"
  local prompt="$2"
  local value=""

  read -r -s -p "$prompt: " value
  echo

  if [[ -z "$value" ]]; then
    echo "Skipping $name"
    return
  fi

  if gcloud secrets describe "$name" >/dev/null 2>&1; then
    printf "%s" "$value" | gcloud secrets versions add "$name" --data-file=- >/dev/null
  else
    printf "%s" "$value" | gcloud secrets create "$name" \
      --replication-policy=automatic \
      --data-file=- >/dev/null
  fi

  echo "Set $name"
}

set_secret "STRIPE_SECRET_KEY" "Stripe Secret Key (sk_...)"
set_secret "STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret (whsec_...)"
set_secret "YOUTUBE_CLIENT_ID" "YouTube OAuth Client ID"
set_secret "YOUTUBE_CLIENT_SECRET" "YouTube OAuth Client Secret"
set_secret "FACEBOOK_APP_ID" "Facebook App ID"
set_secret "FACEBOOK_APP_SECRET" "Facebook App Secret"
set_secret "TWITCH_CLIENT_ID" "Twitch Client ID"
set_secret "TWITCH_CLIENT_SECRET" "Twitch Client Secret"
set_secret "CLAUDE_API_KEY" "Claude API Key"

echo
echo "Secrets configured in Secret Manager."
echo "Next: ./infrastructure/deploy.sh"
