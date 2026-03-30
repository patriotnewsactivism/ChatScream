#!/usr/bin/env bash
set -euo pipefail

# Production deploy helper.
# - APP_TARGET=vercel (default): build + optional Vercel deploy
# - APP_TARGET=aws: build + guidance for container deploy
# - DEPLOY_STREAM_FLEET=true: also deploy/update AWS stream workers

if [[ ! -f "package.json" ]]; then
  echo "Run this script from repo root."
  exit 1
fi

APP_TARGET="${APP_TARGET:-vercel}"
DEPLOY_STREAM_FLEET="${DEPLOY_STREAM_FLEET:-false}"

if [[ ! -f ".env.production" ]]; then
  echo ".env.production not found. Copy .env.production.example first."
  exit 1
fi

echo "Running production checks..."
npm run typecheck
npm run test -- --run

echo "Building app..."
npm run build

if [[ "$DEPLOY_STREAM_FLEET" == "true" ]]; then
  if [[ ! -x "./infrastructure/aws/deploy-stream-fleet.sh" ]]; then
    echo "[ERR] Expected executable: ./infrastructure/aws/deploy-stream-fleet.sh"
    exit 1
  fi

  echo "Deploying AWS stream worker fleet..."
  ./infrastructure/aws/deploy-stream-fleet.sh
fi

case "$APP_TARGET" in
  vercel)
    if command -v vercel >/dev/null 2>&1; then
      echo "Deploying frontend + API to Vercel..."
      vercel deploy --prod
    else
      echo "Vercel CLI not found. Build succeeded; deploy manually with your CI/CD pipeline."
    fi
    ;;
  aws)
    echo "AWS target selected. Build succeeded."
    echo "Deploy server/index.js + dist/ to ECS/Fargate or EC2 using your infra pipeline."
    ;;
  *)
    echo "[ERR] Unsupported APP_TARGET: $APP_TARGET"
    echo "Set APP_TARGET=vercel or APP_TARGET=aws"
    exit 1
    ;;
esac

echo "Production deploy script completed."
