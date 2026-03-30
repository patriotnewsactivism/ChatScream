#!/usr/bin/env bash
set -euo pipefail

# Production environment bootstrap for ChatScream deployments.

echo "========================================"
echo "ChatScream Production Environment Setup"
echo "========================================"
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
echo "Next steps:"
echo "1) Configure production URLs so frontend/backend communicate:"
echo "   - VITE_API_BASE_URL (leave empty for same-origin Vercel deploy)"
echo "   - VITE_FUNCTIONS_BASE_URL (optional override for /api/ai routes)"
echo "   - APP_BASE_URL (frontend public URL)"
echo "   - CORS_ORIGINS (comma-separated allowed frontend origins for backend)"
echo "2) Set backend secrets (do NOT use VITE_ for secrets):"
echo "   - CLAUDE_API_KEY"
echo "   - GEMINI_API_KEY"
echo "   - GOOGLE_CLIENT_SECRET"
echo "   - AUTH_STATE_SECRET"
echo "3) Optional: configure durable auth storage (POSTGRES_URL + REDIS_URL)."
echo

echo "Then run:"
echo "  ./scripts/deploy-production.sh"
