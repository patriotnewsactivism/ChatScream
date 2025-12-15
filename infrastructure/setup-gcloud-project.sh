#!/bin/bash
# =============================================================================
# ChatScream - Google Cloud Project Setup Script
# Copyright 2025. Based out of Houston TX.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"
PROJECT_NAME="ChatScream"
BILLING_ACCOUNT="${GCLOUD_BILLING_ACCOUNT:-}"
REGION="${GCLOUD_REGION:-us-central1}"
RUN_REGION="${GCLOUD_RUN_REGION:-$REGION}"
ZONE="${GCLOUD_ZONE:-us-central1-a}"

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - GCloud Infrastructure   ${NC}"
echo -e "${BLUE}  Copyright 2025. Houston, TX          ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Function to print status
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    print_error "Google Cloud SDK is not installed"
    echo "Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

print_status "Google Cloud SDK is installed"

# Check if logged in
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1 &> /dev/null; then
    print_warning "Not logged into Google Cloud. Running authentication..."
    gcloud auth login
fi

ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -n1)
print_status "Logged in as: $ACCOUNT"

# Create or select project
echo ""
echo -e "${BLUE}Step 1: Project Setup${NC}"

if gcloud projects describe "$PROJECT_ID" &> /dev/null; then
    print_status "Project '$PROJECT_ID' already exists"
else
    print_warning "Creating project '$PROJECT_ID'..."
    gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME"
    print_status "Project created successfully"
fi

# Set the project
gcloud config set project "$PROJECT_ID"
print_status "Project set to: $PROJECT_ID"

# Link billing account if provided
if [ -n "$BILLING_ACCOUNT" ]; then
    echo ""
    echo -e "${BLUE}Step 2: Billing Setup${NC}"
    gcloud billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
    print_status "Billing account linked"
else
    print_warning "No billing account provided. Set GCLOUD_BILLING_ACCOUNT to enable paid services."
    echo "  You can find your billing account ID at: https://console.cloud.google.com/billing"
fi

# Enable required APIs
echo ""
echo -e "${BLUE}Step 3: Enabling Required APIs${NC}"

APIS=(
    "compute.googleapis.com"           # Compute Engine (VM)
    "firebase.googleapis.com"          # Firebase
    "firestore.googleapis.com"         # Firestore Database
    "cloudfunctions.googleapis.com"    # Cloud Functions
    "cloudbuild.googleapis.com"        # Cloud Build
    "run.googleapis.com"               # Cloud Run
    "secretmanager.googleapis.com"     # Secret Manager
    "storage.googleapis.com"           # Cloud Storage
    "cloudresourcemanager.googleapis.com"  # Resource Manager
    "iam.googleapis.com"               # IAM
    "logging.googleapis.com"           # Logging
    "monitoring.googleapis.com"        # Monitoring
)

for api in "${APIS[@]}"; do
    echo "  Enabling $api..."
    gcloud services enable "$api" --quiet
done
print_status "All required APIs enabled"

# Set default region and zone
echo ""
echo -e "${BLUE}Step 4: Setting Default Region/Zone${NC}"
gcloud config set compute/region "$REGION"
gcloud config set compute/zone "$ZONE"
gcloud config set run/region "$RUN_REGION"
gcloud config set run/platform managed
print_status "Default region: $REGION"
print_status "Default zone: $ZONE"
print_status "Cloud Run region: $RUN_REGION"

# Create service account for the application
echo ""
echo -e "${BLUE}Step 5: Service Account Setup${NC}"

SA_NAME="chatscream-app"
SA_EMAIL="$SA_NAME@$PROJECT_ID.iam.gserviceaccount.com"

if gcloud iam service-accounts describe "$SA_EMAIL" &> /dev/null; then
    print_status "Service account already exists"
else
    gcloud iam service-accounts create "$SA_NAME" \
        --display-name="ChatScream Application" \
        --description="Service account for ChatScream application"
    print_status "Service account created: $SA_EMAIL"
fi

# Grant necessary roles
ROLES=(
    "roles/firebase.admin"
    "roles/datastore.user"
    "roles/secretmanager.secretAccessor"
    "roles/storage.objectAdmin"
    "roles/logging.logWriter"
    "roles/monitoring.metricWriter"
)

for role in "${ROLES[@]}"; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" \
        --member="serviceAccount:$SA_EMAIL" \
        --role="$role" \
        --quiet 2>/dev/null || true
done
print_status "IAM roles assigned to service account"

# Create VPC network for the VM
echo ""
echo -e "${BLUE}Step 6: Network Setup${NC}"

if gcloud compute networks describe chatscream-network &> /dev/null; then
    print_status "VPC network already exists"
else
    gcloud compute networks create chatscream-network \
        --subnet-mode=auto \
        --description="VPC network for ChatScream"
    print_status "VPC network created"
fi

# Create firewall rules
echo "  Configuring firewall rules..."

# Allow HTTP/HTTPS
gcloud compute firewall-rules create chatscream-allow-http \
    --network=chatscream-network \
    --allow=tcp:80,tcp:443 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=chatscream-vm \
    --description="Allow HTTP/HTTPS traffic" \
    --quiet 2>/dev/null || true

# Allow RTMP (for streaming)
gcloud compute firewall-rules create chatscream-allow-rtmp \
    --network=chatscream-network \
    --allow=tcp:1935,tcp:1936 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=chatscream-vm \
    --description="Allow RTMP streaming traffic" \
    --quiet 2>/dev/null || true

# Allow SSH (for management)
gcloud compute firewall-rules create chatscream-allow-ssh \
    --network=chatscream-network \
    --allow=tcp:22 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=chatscream-vm \
    --description="Allow SSH access" \
    --quiet 2>/dev/null || true

# Allow WebRTC ports
gcloud compute firewall-rules create chatscream-allow-webrtc \
    --network=chatscream-network \
    --allow=udp:10000-60000 \
    --source-ranges=0.0.0.0/0 \
    --target-tags=chatscream-vm \
    --description="Allow WebRTC traffic" \
    --quiet 2>/dev/null || true

print_status "Firewall rules configured"

# Create Cloud Storage bucket for media assets
echo ""
echo -e "${BLUE}Step 7: Cloud Storage Setup${NC}"

BUCKET_NAME="${PROJECT_ID}-media"

if gsutil ls "gs://$BUCKET_NAME" &> /dev/null; then
    print_status "Storage bucket already exists"
else
    gsutil mb -l "$REGION" "gs://$BUCKET_NAME"
    gsutil iam ch allUsers:objectViewer "gs://$BUCKET_NAME"
    print_status "Storage bucket created: $BUCKET_NAME"
fi

# Output summary
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  Setup Complete!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "Project ID:       $PROJECT_ID"
echo "Region:           $REGION"
echo "Zone:             $ZONE"
echo "Service Account:  $SA_EMAIL"
echo "Storage Bucket:   gs://$BUCKET_NAME"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "1. Run ./create-vm.sh to create the streaming VM"
echo "2. Run ./setup-firebase.sh to configure Firebase"
echo "3. Update .env with your credentials"
echo "4. Run ./deploy.sh to deploy the application"
echo ""
