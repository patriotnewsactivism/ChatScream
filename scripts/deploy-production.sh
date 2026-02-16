#!/usr/bin/env bash
set -euo pipefail

# Production deploy helper (Cloud Run)

if [[ ! -f "package.json" ]]; then
  echo "Run this script from repo root."
  exit 1
fi

if [[ ! -f ".env.production" ]]; then
  echo ".env.production not found. Copy .env.production.example first."
  exit 1
fi

echo "Running production checks..."
npm run typecheck
npm run test -- --run

echo "Building app..."
npm run build

echo "Deploying to Cloud Run..."
./infrastructure/deploy.sh all

echo "Production deploy complete."

