#!/bin/bash
# =============================================================================
# ChatScream - Firebase Setup Script
# Copyright 2025. Based out of Houston TX.
# =============================================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - Firebase Setup          ${NC}"
echo -e "${BLUE}  Copyright 2025. Houston, TX          ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo -e "${YELLOW}Installing Firebase CLI...${NC}"
    npm install -g firebase-tools
fi

echo -e "${GREEN}[✓]${NC} Firebase CLI installed"

# Check if logged in
if ! firebase login:list | grep -q "email"; then
    echo -e "${YELLOW}Please log in to Firebase...${NC}"
    firebase login
fi

echo -e "${GREEN}[✓]${NC} Logged into Firebase"

# Initialize Firebase in the project
echo ""
echo -e "${BLUE}Step 1: Setting up Firebase project${NC}"

cd /home/user/StreamMobPro

# Create .firebaserc if it doesn't exist
if [ ! -f ".firebaserc" ]; then
    cat > .firebaserc << EOF
{
  "projects": {
    "default": "${PROJECT_ID}",
    "production": "${PROJECT_ID}",
    "staging": "${PROJECT_ID}-staging"
  }
}
EOF
    echo -e "${GREEN}[✓]${NC} Created .firebaserc"
fi

# Use the project
firebase use "$PROJECT_ID" || firebase use --add

echo ""
echo -e "${BLUE}Step 2: Setting up Firestore${NC}"

# Enable Firestore via gcloud (Firebase CLI doesn't support this directly)
echo "Creating Firestore database..."
gcloud firestore databases create \
    --project="$PROJECT_ID" \
    --location=us-central \
    --type=firestore-native \
    2>/dev/null || echo "Firestore database may already exist"

echo -e "${GREEN}[✓]${NC} Firestore database configured"

echo ""
echo -e "${BLUE}Step 3: Deploying Firestore Rules${NC}"

firebase deploy --only firestore:rules
echo -e "${GREEN}[✓]${NC} Firestore rules deployed"

echo ""
echo -e "${BLUE}Step 4: Deploying Firestore Indexes${NC}"

firebase deploy --only firestore:indexes
echo -e "${GREEN}[✓]${NC} Firestore indexes deployed"

echo ""
echo -e "${BLUE}Step 5: Setting up Firebase Hosting${NC}"

firebase target:apply hosting production "$PROJECT_ID"
echo -e "${GREEN}[✓]${NC} Hosting target configured"

echo ""
echo -e "${BLUE}Step 6: Configuring Functions Environment${NC}"

# Set Stripe secrets (user will need to provide these)
echo -e "${YELLOW}To complete setup, run the following commands with your actual keys:${NC}"
echo ""
echo "firebase functions:secrets:set STRIPE_SECRET_KEY"
echo "firebase functions:secrets:set STRIPE_WEBHOOK_SECRET"
echo ""
echo "Or set via Firebase console: https://console.firebase.google.com/project/${PROJECT_ID}/functions"

# Get Firebase web app config
echo ""
echo -e "${BLUE}Step 7: Getting Firebase Config${NC}"

# Create web app if it doesn't exist
firebase apps:list | grep -q "ChatScream Web" || \
    firebase apps:create web "ChatScream Web"

# Get the config
echo ""
echo -e "${YELLOW}Firebase Web Config:${NC}"
firebase apps:sdkconfig web

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Firebase Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Next steps:"
echo "1. Copy the Firebase config above to your .env file"
echo "2. Set Stripe secrets using Firebase Functions"
echo "3. Deploy functions: firebase deploy --only functions"
echo "4. Deploy hosting: firebase deploy --only hosting"
echo ""
