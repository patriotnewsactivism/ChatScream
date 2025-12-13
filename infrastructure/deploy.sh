#!/bin/bash
# =============================================================================
# ChatScream - Full Deployment Script
# Copyright 2025. Based out of Houston TX.
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ID="${GCLOUD_PROJECT_ID:-wtp-apps}"
DEPLOY_TARGET="${1:-all}"  # all, functions, hosting, rules

# Get the script directory and project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - Deployment              ${NC}"
echo -e "${BLUE}  Copyright 2025. Houston, TX          ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Project:    $PROJECT_ID"
echo "Target:     $DEPLOY_TARGET"
echo "Directory:  $PROJECT_ROOT"
echo ""

cd "$PROJECT_ROOT"

# Ensure we're using the right project
firebase use "$PROJECT_ID"

case $DEPLOY_TARGET in
    "all")
        echo -e "${BLUE}[1/5] Building frontend...${NC}"
        npm install
        npm run build
        echo -e "${GREEN}[✓]${NC} Frontend built"

        echo ""
        echo -e "${BLUE}[2/5] Building functions...${NC}"
        cd functions
        npm install
        npm run build
        cd ..
        echo -e "${GREEN}[✓]${NC} Functions built"

        echo ""
        echo -e "${BLUE}[3/5] Deploying Firestore rules and indexes...${NC}"
        firebase deploy --only firestore
        echo -e "${GREEN}[✓]${NC} Firestore deployed"

        echo ""
        echo -e "${BLUE}[4/5] Deploying Cloud Functions...${NC}"
        firebase deploy --only functions
        echo -e "${GREEN}[✓]${NC} Functions deployed"

        echo ""
        echo -e "${BLUE}[5/5] Deploying Hosting...${NC}"
        firebase deploy --only hosting
        echo -e "${GREEN}[✓]${NC} Hosting deployed"
        ;;

    "functions")
        echo -e "${BLUE}Building and deploying functions...${NC}"
        cd functions
        npm install
        npm run build
        cd ..
        firebase deploy --only functions
        echo -e "${GREEN}[✓]${NC} Functions deployed"
        ;;

    "hosting")
        echo -e "${BLUE}Building and deploying frontend...${NC}"
        npm install
        npm run build
        firebase deploy --only hosting
        echo -e "${GREEN}[✓]${NC} Hosting deployed"
        ;;

    "rules")
        echo -e "${BLUE}Deploying Firestore rules and indexes...${NC}"
        firebase deploy --only firestore
        echo -e "${GREEN}[✓]${NC} Firestore rules deployed"
        ;;

    *)
        echo -e "${RED}Unknown deploy target: $DEPLOY_TARGET${NC}"
        echo "Usage: ./deploy.sh [all|functions|hosting|rules]"
        exit 1
        ;;
esac

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Deployment Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Get hosting URL
HOSTING_URL=$(firebase hosting:channel:list --json 2>/dev/null | grep "url" | head -1 | cut -d'"' -f4)
if [ -z "$HOSTING_URL" ]; then
    HOSTING_URL="https://${PROJECT_ID}.web.app"
fi

echo "Live URL: $HOSTING_URL"
echo ""
echo "Useful commands:"
echo "  firebase hosting:channel:list  - View all hosting channels"
echo "  firebase functions:log         - View function logs"
echo "  firebase emulators:start       - Start local emulators"
echo ""
