#!/bin/bash

# =============================================================================
# ChatScream Production Deployment Script
# =============================================================================
# This script performs a full production deployment with safety checks
# Usage: ./scripts/deploy-production.sh
# =============================================================================

set -e  # Exit on error

echo "🚀 ChatScream Production Deployment"
echo "===================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if running from project root
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must run from project root${NC}"
    exit 1
fi

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI not found. Install with: npm install -g firebase-tools${NC}"
    exit 1
fi

# Confirm production deployment
echo -e "${YELLOW}⚠️  WARNING: You are about to deploy to PRODUCTION${NC}"
echo ""
read -p "Are you sure you want to continue? (yes/no): " -r
echo ""
if [[ ! $REPLY =~ ^yes$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

# Step 1: Run tests
echo "Step 1/8: Running tests..."
echo "─────────────────────────────"
npm run typecheck || { echo -e "${RED}Type check failed${NC}"; exit 1; }
npm test -- --run || { echo -e "${RED}Unit tests failed${NC}"; exit 1; }
echo -e "${GREEN}✓ Tests passed${NC}"
echo ""

# Step 2: Build frontend
echo "Step 2/8: Building frontend..."
echo "─────────────────────────────"
if [ ! -f ".env.production" ]; then
    echo -e "${RED}Error: .env.production file not found${NC}"
    echo "Copy .env.production.example and fill in production values"
    exit 1
fi

# Load production env vars
set -a
source .env.production
set +a

npm run build || { echo -e "${RED}Build failed${NC}"; exit 1; }
echo -e "${GREEN}✓ Frontend built${NC}"
echo ""

# Step 3: Build functions
echo "Step 3/8: Building Cloud Functions..."
echo "─────────────────────────────────────"
cd functions
npm run build || { echo -e "${RED}Functions build failed${NC}"; exit 1; }
cd ..
echo -e "${GREEN}✓ Functions built${NC}"
echo ""

# Step 4: Verify Firebase project
echo "Step 4/8: Verifying Firebase project..."
echo "────────────────────────────────────────"
CURRENT_PROJECT=$(firebase projects:list --json | grep -o '"wtp-apps"' | head -1 | tr -d '"')
if [ "$CURRENT_PROJECT" != "wtp-apps" ]; then
    echo -e "${YELLOW}Switching to wtp-apps project${NC}"
    firebase use wtp-apps
fi
echo -e "${GREEN}✓ Using project: wtp-apps${NC}"
echo ""

# Step 5: Check secrets
echo "Step 5/8: Checking Cloud Functions secrets..."
echo "──────────────────────────────────────────────"
REQUIRED_SECRETS=(
    "STRIPE_SECRET_KEY"
    "STRIPE_WEBHOOK_SECRET"
    "YOUTUBE_CLIENT_ID"
    "YOUTUBE_CLIENT_SECRET"
    "FACEBOOK_APP_ID"
    "FACEBOOK_APP_SECRET"
    "TWITCH_CLIENT_ID"
    "TWITCH_CLIENT_SECRET"
    "CLAUDE_API_KEY"
)

MISSING_SECRETS=()
for secret in "${REQUIRED_SECRETS[@]}"; do
    if ! firebase functions:secrets:access "$secret" --project wtp-apps &> /dev/null; then
        MISSING_SECRETS+=("$secret")
    fi
done

if [ ${#MISSING_SECRETS[@]} -ne 0 ]; then
    echo -e "${RED}Error: Missing required secrets:${NC}"
    printf '%s\n' "${MISSING_SECRETS[@]}"
    echo ""
    echo "Set secrets with:"
    echo "  firebase functions:secrets:set SECRET_NAME --project wtp-apps"
    exit 1
fi
echo -e "${GREEN}✓ All secrets configured${NC}"
echo ""

# Step 6: Deploy rules first
echo "Step 6/8: Deploying Firestore & Storage rules..."
echo "─────────────────────────────────────────────────"
firebase deploy --only firestore:rules,storage:rules --project wtp-apps || {
    echo -e "${RED}Rules deployment failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Rules deployed${NC}"
echo ""

# Step 7: Deploy functions
echo "Step 7/8: Deploying Cloud Functions..."
echo "───────────────────────────────────────"
firebase deploy --only functions --project wtp-apps || {
    echo -e "${RED}Functions deployment failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Functions deployed${NC}"
echo ""

# Step 8: Deploy hosting
echo "Step 8/8: Deploying hosting..."
echo "───────────────────────────────"
firebase deploy --only hosting:production --project wtp-apps || {
    echo -e "${RED}Hosting deployment failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Hosting deployed${NC}"
echo ""

# Deployment complete
echo "════════════════════════════════════════"
echo -e "${GREEN}✅ Production Deployment Complete!${NC}"
echo "════════════════════════════════════════"
echo ""
echo "🌐 Application URL: https://wtp-apps.web.app"
echo "📊 Firebase Console: https://console.firebase.google.com/project/wtp-apps"
echo "💳 Stripe Dashboard: https://dashboard.stripe.com"
echo ""
echo "Next steps:"
echo "1. Test the deployed application"
echo "2. Monitor Cloud Functions logs"
echo "3. Verify Stripe webhook is working"
echo "4. Check Sentry for any errors"
echo ""
