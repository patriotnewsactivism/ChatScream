#!/usr/bin/env bash
set -euo pipefail

echo "========================================"
echo "ChatScream .env Setup"
echo "========================================"
echo

default_api_proxy="http://localhost:8787"
default_redirect_uri="http://localhost:3000/oauth/callback"

read -r -p "VITE_API_BASE_URL (leave blank for same-origin): " api_base_url
read -r -p "VITE_API_PROXY_TARGET [${default_api_proxy}]: " api_proxy_target
read -r -p "VITE_OAUTH_REDIRECT_URI [${default_redirect_uri}]: " oauth_redirect_uri
read -r -p "VITE_YOUTUBE_CLIENT_ID: " youtube_client_id
read -r -p "VITE_FACEBOOK_APP_ID: " facebook_app_id
read -r -p "VITE_TWITCH_CLIENT_ID: " twitch_client_id
read -r -p "VITE_STRIPE_PUBLISHABLE_KEY: " stripe_publishable_key
read -r -p "VITE_CLAUDE_API_KEY (optional): " claude_api_key
read -r -p "VITE_GEMINI_API_KEY (optional): " gemini_api_key

api_proxy_target="${api_proxy_target:-$default_api_proxy}"
oauth_redirect_uri="${oauth_redirect_uri:-$default_redirect_uri}"

cat > .env <<EOF
# ChatScream local environment

VITE_API_BASE_URL=${api_base_url}
VITE_API_PROXY_TARGET=${api_proxy_target}
VITE_OAUTH_REDIRECT_URI=${oauth_redirect_uri}

VITE_YOUTUBE_CLIENT_ID=${youtube_client_id}
VITE_FACEBOOK_APP_ID=${facebook_app_id}
VITE_TWITCH_CLIENT_ID=${twitch_client_id}

VITE_STRIPE_PUBLISHABLE_KEY=${stripe_publishable_key}
VITE_CLAUDE_API_KEY=${claude_api_key}
VITE_GEMINI_API_KEY=${gemini_api_key}

VITE_APP_ENV=development
VITE_DEBUG=true
EOF

echo
echo ".env created successfully."
echo "Run: npm run dev"

