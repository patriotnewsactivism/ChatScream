#!/bin/bash

# =============================================================================
# Production Environment Setup Script
# =============================================================================
# This script helps set up all required secrets and configurations
# for production deployment
# =============================================================================

set -e

echo "🔧 ChatScream Production Environment Setup"
echo "==========================================="
echo ""

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Check Firebase CLI
if ! command -v firebase &> /dev/null; then
    echo -e "${RED}Error: Firebase CLI not installed${NC}"
    echo "Install with: npm install -g firebase-tools"
    exit 1
fi

# Login to Firebase
echo -e "${BLUE}Step 1: Firebase Login${NC}"
echo "─────────────────────────"
firebase login
echo ""

# Select project
echo -e "${BLUE}Step 2: Select Project${NC}"
echo "──────────────────────────"
firebase use wtp-apps
echo ""

# Set up secrets
echo -e "${BLUE}Step 3: Configure Cloud Functions Secrets${NC}"
echo "──────────────────────────────────────────"
echo ""

# Function to set secret
set_secret() {
    local secret_name=$1
    local description=$2

    echo -e "${YELLOW}Setting: $secret_name${NC}"
    echo "$description"

    # Check if secret already exists
    if firebase functions:secrets:access "$secret_name" --project wtp-apps &> /dev/null; then
        echo -e "${GREEN}✓ Already configured${NC}"
        read -p "Do you want to update it? (y/n): " -r
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            echo "Skipping..."
            echo ""
            return
        fi
    fi

    firebase functions:secrets:set "$secret_name" --project wtp-apps
    echo -e "${GREEN}✓ Configured${NC}"
    echo ""
}

# Stripe Secrets
echo "━━━ Stripe Configuration ━━━"
set_secret "STRIPE_SECRET_KEY" "Enter your Stripe LIVE secret key (starts with sk_live_)"
set_secret "STRIPE_WEBHOOK_SECRET" "Enter your Stripe webhook signing secret (starts with whsec_)"

# OAuth Secrets
echo "━━━ OAuth Configuration ━━━"
set_secret "YOUTUBE_CLIENT_ID" "Enter your YouTube OAuth Client ID"
set_secret "YOUTUBE_CLIENT_SECRET" "Enter your YouTube OAuth Client Secret"
set_secret "FACEBOOK_APP_ID" "Enter your Facebook App ID"
set_secret "FACEBOOK_APP_SECRET" "Enter your Facebook App Secret"
set_secret "TWITCH_CLIENT_ID" "Enter your Twitch Client ID"
set_secret "TWITCH_CLIENT_SECRET" "Enter your Twitch Client Secret"

# AI Secrets
echo "━━━ AI Configuration ━━━"
set_secret "CLAUDE_API_KEY" "Enter your Claude API key"

echo ""
echo -e "${GREEN}✅ All secrets configured!${NC}"
echo ""

# Create .env.production file
echo -e "${BLUE}Step 4: Create .env.production${NC}"
echo "───────────────────────────────────"

if [ -f ".env.production" ]; then
    echo -e "${YELLOW}⚠️  .env.production already exists${NC}"
    read -p "Do you want to recreate it? (y/n): " -r
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Keeping existing file..."
    else
        cp .env.production.example .env.production
        echo -e "${GREEN}✓ Created .env.production${NC}"
        echo "Please edit .env.production and fill in all values"
    fi
else
    cp .env.production.example .env.production
    echo -e "${GREEN}✓ Created .env.production${NC}"
    echo "Please edit .env.production and fill in all values"
fi
echo ""

# Summary
echo "════════════════════════════════════════"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo "════════════════════════════════════════"
echo ""
echo "Next steps:"
echo "1. Edit .env.production with your Firebase & Stripe keys"
echo "2. Configure OAuth redirect URIs in provider consoles:"
echo "   - YouTube: https://wtp-apps.web.app/__/auth/handler"
echo "   - Facebook: https://wtp-apps.web.app/__/auth/handler"
echo "   - Twitch: https://wtp-apps.web.app/__/auth/handler"
echo "3. Set up Stripe webhook:"
echo "   - URL: https://wtp-apps.web.app/api/stripe-webhook"
echo "   - Events: payment_intent.*, customer.subscription.*"
echo "4. Run: ./scripts/deploy-production.sh"
echo ""
