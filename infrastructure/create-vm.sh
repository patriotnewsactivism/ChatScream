#!/usr/bin/env bash
# =============================================================================
# ChatScream - VM Instance Creation
# =============================================================================

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

PROJECT_ID="${GCLOUD_PROJECT_ID:-chatscream-prod}"
ZONE="${GCLOUD_ZONE:-us-central1-a}"
VM_NAME="${VM_NAME:-chatscream-media-server}"
MACHINE_TYPE="${MACHINE_TYPE:-e2-standard-4}"
DISK_SIZE="${DISK_SIZE:-100}"
STARTUP_SCRIPT="${STARTUP_SCRIPT:-$SCRIPT_DIR/scripts/vm-startup.sh}"

if [[ ! -f "$STARTUP_SCRIPT" ]]; then
  echo -e "${RED}[ERR]${NC} Startup script not found: $STARTUP_SCRIPT"
  exit 1
fi

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  ChatScream - VM Instance Setup       ${NC}"
echo -e "${BLUE}========================================${NC}"
echo

if gcloud compute instances describe "$VM_NAME" --zone="$ZONE" >/dev/null 2>&1; then
  echo -e "${YELLOW}[WARN]${NC} VM '$VM_NAME' already exists"
  read -r -p "Delete and recreate it? (y/N): " recreate
  if [[ ! "$recreate" =~ ^[Yy]$ ]]; then
    echo "No changes made."
    exit 0
  fi
  gcloud compute instances delete "$VM_NAME" --zone="$ZONE" --quiet
fi

echo "Creating VM..."
echo "  Name:         $VM_NAME"
echo "  Machine type: $MACHINE_TYPE"
echo "  Disk:         ${DISK_SIZE}GB"
echo "  Zone:         $ZONE"

gcloud compute instances create "$VM_NAME" \
  --project="$PROJECT_ID" \
  --zone="$ZONE" \
  --machine-type="$MACHINE_TYPE" \
  --network="chatscream-network" \
  --tags="chatscream-vm" \
  --image-family="ubuntu-2204-lts" \
  --image-project="ubuntu-os-cloud" \
  --boot-disk-size="${DISK_SIZE}GB" \
  --boot-disk-type="pd-ssd" \
  --metadata-from-file=startup-script="$STARTUP_SCRIPT" \
  --scopes="cloud-platform" \
  --service-account="chatscream-app@${PROJECT_ID}.iam.gserviceaccount.com"

EXTERNAL_IP="$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" --format='get(networkInterfaces[0].accessConfigs[0].natIP)')"

INFO_FILE="$SCRIPT_DIR/.vm-info"
cat > "$INFO_FILE" <<EOF
VM_NAME=$VM_NAME
EXTERNAL_IP=$EXTERNAL_IP
ZONE=$ZONE
PROJECT_ID=$PROJECT_ID
RTMP_ENDPOINT=rtmp://$EXTERNAL_IP:1935/live
HLS_ENDPOINT=http://$EXTERNAL_IP/hls
CREATED_AT=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
EOF

echo
echo -e "${GREEN}[OK]${NC} VM created"
echo "External IP:    $EXTERNAL_IP"
echo "SSH:            gcloud compute ssh $VM_NAME --zone=$ZONE"
echo "RTMP endpoint:  rtmp://$EXTERNAL_IP:1935/live"
echo "HLS endpoint:   http://$EXTERNAL_IP/hls"
echo "Saved metadata: $INFO_FILE"
