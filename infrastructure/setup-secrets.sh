#!/usr/bin/env bash
set -euo pipefail

# Sets required Firebase Secret Manager secrets for ChatScream Functions.
# Run from repo root: ./infrastructure/setup-secrets.sh
#
# Notes:
# - Requires: firebase CLI authenticated with access to the target project.
# - This script only creates/updates secrets; you still need to deploy functions afterward.

PROJECT_ID="${PROJECT_ID:-wtp-apps}"

if [[ "${1:-}" != "" ]]; then
  PROJECT_ID="$1"
fi

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Missing required command: $1" >&2
    exit 1
  fi
}

require_cmd firebase

echo "Target Firebase project: ${PROJECT_ID}"
echo

set_secret() {
  local name="$1"
  local prompt="$2"
  local value="${3:-}"

  if [[ -z "${value}" ]]; then
    read -r -s -p "${prompt}: " value
    echo
  fi

  if [[ -z "${value}" ]]; then
    echo "Skipping ${name} (empty)." >&2
    return 0
  fi

  printf "%s" "${value}" | firebase functions:secrets:set "${name}" \
    --project "${PROJECT_ID}" \
    --data-file - >/dev/null

  echo "Set ${name}"
}

echo "Enter secrets (input hidden). Leave blank to skip."
echo

set_secret "STRIPE_SECRET_KEY" "Stripe Secret Key (sk_...)"
set_secret "STRIPE_WEBHOOK_SECRET" "Stripe Webhook Secret (whsec_...)"
echo
set_secret "YOUTUBE_CLIENT_ID" "YouTube OAuth Client ID"
set_secret "YOUTUBE_CLIENT_SECRET" "YouTube OAuth Client Secret"
echo
set_secret "FACEBOOK_APP_ID" "Facebook App ID"
set_secret "FACEBOOK_APP_SECRET" "Facebook App Secret"
echo
set_secret "TWITCH_CLIENT_ID" "Twitch Client ID"
set_secret "TWITCH_CLIENT_SECRET" "Twitch Client Secret"

echo
echo "Done setting secrets."
echo "Next: firebase deploy --only functions --project ${PROJECT_ID}"

