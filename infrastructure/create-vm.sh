#!/bin/bash
# =============================================================================
# ChatScream - VM Instance Creation Script
# Copyright 2025. Based out of Houston TX.
# =============================================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"
ZONE="${GCLOUD_ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-chatscream-media-server}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"  # 4 vCPU, 16GB RAM
DISK_SIZE="${DISK_SIZE:-100}"  # GB

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - VM Instance Setup       ${NC}"
echo -e "${BLUE}  Copyright 2025. Houston, TX          ${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# Check if VM already exists
if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" &> /dev/null; then
    echo -e "${YELLOW}VM '$VM_NAME' already exists.${NC}"
    read -p "Do you want to delete and recreate it? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo "Deleting existing VM..."
        gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --quiet
    else
        echo "Exiting without changes."
        exit 0
    fi
fi

echo -e "${BLUE}Creating VM instance: $VM_NAME${NC}"
echo "  Machine type: $MACHINE_TYPE"
echo "  Disk size: ${DISK_SIZE}GB"
echo "  Zone: $ZONE"
echo ""

# Create the VM with startup script
gcloud compute instances create "$VM_NAME" \
    --zone="$ZONE" \
    --machine-type="$MACHINE_TYPE" \
    --network="chatscream-network" \
    --tags="chatscream-vm" \
    --image-family="ubuntu-2204-lts" \
    --image-project="ubuntu-os-cloud" \
    --boot-disk-size="${DISK_SIZE}GB" \
    --boot-disk-type="pd-ssd" \
    --metadata-from-file=startup-script=scripts/vm-startup.sh \
    --scopes="cloud-platform" \
    --service-account="chatscream-app@${PROJECT_ID}.iam.gserviceaccount.com"

echo ""
echo -e "${GREEN}[✓] VM instance created successfully!${NC}"

# Get the external IP
EXTERNAL_IP=$(gcloud compute instances describe "$VM_NAME" \
    --zone="$ZONE" \
    --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${GREEN}  VM Instance Ready!${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo "VM Name:       $VM_NAME"
echo "External IP:   $EXTERNAL_IP"
echo "Zone:          $ZONE"
echo ""
echo "SSH Access:    gcloud compute ssh $VM_NAME --zone=$ZONE"
echo ""
echo -e "${YELLOW}Important:${NC}"
echo "1. Wait 2-3 minutes for startup script to complete"
echo "2. Check startup script logs:"
echo "   gcloud compute ssh $VM_NAME --zone=$ZONE -- sudo journalctl -u google-startup-scripts -f"
echo ""
echo "RTMP Endpoint: rtmp://$EXTERNAL_IP:1935/live"
echo "HTTP Endpoint: http://$EXTERNAL_IP"
echo ""

# Save VM info to file
cat > /home/user/StreamMobPro/infrastructure/.vm-info << EOF
VM_NAME=$VM_NAME
EXTERNAL_IP=$EXTERNAL_IP
ZONE=$ZONE
RTMP_ENDPOINT=rtmp://$EXTERNAL_IP:1935/live
HTTP_ENDPOINT=http://$EXTERNAL_IP
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo -e "${GREEN}VM info saved to infrastructure/.vm-info${NC}"
