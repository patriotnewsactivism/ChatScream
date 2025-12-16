#!/bin/bash
# Quick setup script for .env file

echo "================================================"
echo "ChatScream Environment Setup"
echo "================================================"
echo ""
echo "This script will help you set up your .env file."
echo ""
echo "You need to get your Firebase credentials from:"
echo "https://console.firebase.google.com/project/wtp-apps/settings/general"
echo ""
echo "Scroll to 'Your apps' section and click the Web app icon (</>)"
echo ""
echo "================================================"
echo ""

read -p "Enter VITE_FIREBASE_API_KEY: " api_key
read -p "Enter VITE_FIREBASE_MESSAGING_SENDER_ID: " sender_id
read -p "Enter VITE_FIREBASE_APP_ID: " app_id

# Update .env file
cat > .env << EOF
# =============================================================================
# ChatScream Environment Configuration
# =============================================================================

# -----------------------------------------------------------------------------
# Firebase Configuration (wtp-apps project)
# -----------------------------------------------------------------------------
VITE_FIREBASE_API_KEY=$api_key
VITE_FIREBASE_AUTH_DOMAIN=wtp-apps.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=wtp-apps
VITE_FIREBASE_STORAGE_BUCKET=wtp-apps.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=$sender_id
VITE_FIREBASE_APP_ID=$app_id

# -----------------------------------------------------------------------------
# OAuth Configuration
# -----------------------------------------------------------------------------
VITE_OAUTH_REDIRECT_URI=https://chatscream.live/auth/callback
VITE_YOUTUBE_CLIENT_ID=
VITE_FACEBOOK_APP_ID=
VITE_TWITCH_CLIENT_ID=

# -----------------------------------------------------------------------------
# Stripe Configuration
# -----------------------------------------------------------------------------
VITE_STRIPE_PUBLISHABLE_KEY=
VITE_STRIPE_STARTER_PRICE_ID=
VITE_STRIPE_CREATOR_PRICE_ID=
VITE_STRIPE_PRO_PRICE_ID=

# -----------------------------------------------------------------------------
# AI Configuration
# -----------------------------------------------------------------------------
VITE_CLAUDE_API_KEY=
VITE_GEMINI_API_KEY=

# -----------------------------------------------------------------------------
# Environment
# -----------------------------------------------------------------------------
VITE_APP_ENV=production
VITE_DEBUG=false
VITE_SENTRY_DSN=
EOF

echo ""
echo "================================================"
echo ".env file has been updated!"
echo "================================================"
echo ""
echo "Next steps:"
echo "1. Review and update any other required values in .env"
echo "2. Run: npm run build"
echo "3. Run: firebase deploy --only hosting:production --project wtp-apps"
echo ""
