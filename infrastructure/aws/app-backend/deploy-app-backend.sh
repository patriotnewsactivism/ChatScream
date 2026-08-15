#!/usr/bin/env bash
# Provision (or re-print the info for) the single EC2 instance that runs the
# ChatScream app backend — auth, OAuth token exchange, and the RTMP relay
# WebSocket that streams to YouTube/Facebook/Twitch/etc.
#
# This is NOT the autoscaling FFmpeg worker fleet in infrastructure/aws/ —
# that's separate, unrelated infrastructure for the not-yet-built Cloud
# Streaming feature. You don't need it to make live streaming work.
#
# Idempotent: re-running this script when an instance tagged $INSTANCE_NAME
# is already running just prints its current public IP instead of launching
# a duplicate.

set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERR] Missing required command: $1"
    exit 1
  fi
}

require_cmd aws
require_cmd jq

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_DATA_FILE="${USER_DATA_FILE:-$SCRIPT_DIR/user-data.sh}"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/.env.aws.app}"

if [[ -f "$CONFIG_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
  set +a
fi

if [[ ! -f "$USER_DATA_FILE" ]]; then
  echo "[ERR] user data file not found: $USER_DATA_FILE"
  exit 1
fi

AWS_REGION="${AWS_REGION:-us-east-1}"
VPC_ID="${VPC_ID:-}"
SUBNET_ID="${SUBNET_ID:-}"
KEY_NAME="${KEY_NAME:-}"
INSTANCE_TYPE="${INSTANCE_TYPE:-t3.small}"
INSTANCE_NAME="${INSTANCE_NAME:-chatscream-app-backend}"
SECURITY_GROUP_NAME="${SECURITY_GROUP_NAME:-chatscream-app-backend-sg}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:-}"
INSTANCE_PROFILE_NAME="${INSTANCE_PROFILE_NAME:-}"
AMI_ID="${AMI_ID:-}"

if [[ -z "$VPC_ID" ]]; then
  echo "[ERR] VPC_ID is required."
  exit 1
fi

if [[ -z "$SUBNET_ID" ]]; then
  echo "[ERR] SUBNET_ID is required (must have a route to an internet gateway)."
  exit 1
fi

if [[ -z "$KEY_NAME" ]]; then
  echo "[ERR] KEY_NAME is required (an existing EC2 key pair, so you can SSH in)."
  exit 1
fi

# ── Reuse an existing instance if one's already running ─────────────────────
EXISTING_INSTANCE_ID="$(
  aws ec2 describe-instances \
    --region "$AWS_REGION" \
    --filters "Name=tag:Name,Values=$INSTANCE_NAME" \
              "Name=instance-state-name,Values=pending,running" \
    --query 'Reservations[0].Instances[0].InstanceId' \
    --output text 2>/dev/null || true
)"

if [[ -n "$EXISTING_INSTANCE_ID" && "$EXISTING_INSTANCE_ID" != "None" ]]; then
  EXISTING_IP="$(
    aws ec2 describe-instances \
      --region "$AWS_REGION" \
      --instance-ids "$EXISTING_INSTANCE_ID" \
      --query 'Reservations[0].Instances[0].PublicIpAddress' \
      --output text
  )"
  echo "An instance named '$INSTANCE_NAME' is already running: $EXISTING_INSTANCE_ID ($EXISTING_IP)"
  echo "Not launching a duplicate. Terminate it first if you want a fresh one."
  exit 0
fi

# ── Resolve a Ubuntu 22.04 AMI via SSM if not pinned ─────────────────────────
# Try gp3 first, fall back to gp2 — some regions/partitions haven't published
# a gp3 parameter for every Ubuntu release yet (mirrors deploy-stream-fleet.sh).
if [[ -z "$AMI_ID" ]]; then
  ARCH="amd64"
  if [[ "$INSTANCE_TYPE" == t4g* || "$INSTANCE_TYPE" == c7g* || "$INSTANCE_TYPE" == m7g* ]]; then
    ARCH="arm64"
  fi

  SSM_AMI_PARAMS=(
    "/aws/service/canonical/ubuntu/server/22.04/stable/current/${ARCH}/hvm/ebs-gp3/ami-id"
    "/aws/service/canonical/ubuntu/server/22.04/stable/current/${ARCH}/hvm/ebs-gp2/ami-id"
  )

  for ssm_param in "${SSM_AMI_PARAMS[@]}"; do
    maybe_ami="$(
      aws ssm get-parameter \
        --region "$AWS_REGION" \
        --name "$ssm_param" \
        --query 'Parameter.Value' \
        --output text 2>/dev/null || true
    )"
    if [[ -n "$maybe_ami" && "$maybe_ami" != "None" ]]; then
      AMI_ID="$maybe_ami"
      break
    fi
  done

  if [[ -z "$AMI_ID" ]]; then
    echo "[ERR] Could not resolve a Ubuntu 22.04 AMI from SSM for arch $ARCH in $AWS_REGION."
    exit 1
  fi
fi

# ── Security group: SSH + HTTP + HTTPS only. No port 8787 exposed — Caddy
#    (running on the instance) is the only public entry point, on 80/443. ──
if [[ -z "$SECURITY_GROUP_ID" ]]; then
  SECURITY_GROUP_ID="$(
    aws ec2 describe-security-groups \
      --region "$AWS_REGION" \
      --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" "Name=vpc-id,Values=$VPC_ID" \
      --query 'SecurityGroups[0].GroupId' \
      --output text 2>/dev/null || true
  )"

  if [[ -z "$SECURITY_GROUP_ID" || "$SECURITY_GROUP_ID" == "None" ]]; then
    SECURITY_GROUP_ID="$(
      aws ec2 create-security-group \
        --region "$AWS_REGION" \
        --group-name "$SECURITY_GROUP_NAME" \
        --description "ChatScream app backend (auth, OAuth, RTMP relay)" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' \
        --output text
    )"

    aws ec2 authorize-security-group-ingress \
      --region "$AWS_REGION" \
      --group-id "$SECURITY_GROUP_ID" \
      --ip-permissions \
      '[
        {"IpProtocol":"tcp","FromPort":22,"ToPort":22,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"SSH (restrict this to your IP in production)"}]},
        {"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"HTTP (ACME challenge + redirect to HTTPS)"}]},
        {"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"HTTPS + WSS (API, OAuth, RTMP relay ingest)"}]}
      ]' >/dev/null
  fi
fi

# ── Launch the instance ──────────────────────────────────────────────────────
RUN_ARGS=(
  --region "$AWS_REGION"
  --image-id "$AMI_ID"
  --instance-type "$INSTANCE_TYPE"
  --key-name "$KEY_NAME"
  --subnet-id "$SUBNET_ID"
  --security-group-ids "$SECURITY_GROUP_ID"
  --associate-public-ip-address
  --metadata-options 'HttpEndpoint=enabled,HttpTokens=required'
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"DeleteOnTermination":true,"Encrypted":true,"VolumeType":"gp3","VolumeSize":30}}]'
  --user-data "file://$USER_DATA_FILE"
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$INSTANCE_NAME},{Key=Service,Value=chatscream-app-backend}]"
  --count 1
)
if [[ -n "$INSTANCE_PROFILE_NAME" ]]; then
  RUN_ARGS+=(--iam-instance-profile "Name=$INSTANCE_PROFILE_NAME")
fi

RUN_RESULT="$(aws ec2 run-instances "${RUN_ARGS[@]}")"

INSTANCE_ID="$(echo "$RUN_RESULT" | jq -r '.Instances[0].InstanceId')"

echo "Waiting for instance $INSTANCE_ID to enter 'running' state..."
aws ec2 wait instance-running --region "$AWS_REGION" --instance-ids "$INSTANCE_ID"

# ── Allocate + associate an Elastic IP so the domain doesn't change on reboot ─
ALLOC_RESULT="$(
  aws ec2 allocate-address --region "$AWS_REGION" --domain vpc
)"
ALLOCATION_ID="$(echo "$ALLOC_RESULT" | jq -r '.AllocationId')"
PUBLIC_IP="$(echo "$ALLOC_RESULT" | jq -r '.PublicIp')"

aws ec2 associate-address \
  --region "$AWS_REGION" \
  --instance-id "$INSTANCE_ID" \
  --allocation-id "$ALLOCATION_ID" >/dev/null

echo
echo "ChatScream app backend instance launched."
echo "Instance ID:      $INSTANCE_ID"
echo "Elastic IP:       $PUBLIC_IP"
echo "Security Group:   $SECURITY_GROUP_ID"
echo
echo "Next steps:"
echo "1. Point a DNS A record (e.g. api.yourdomain.com) at $PUBLIC_IP."
echo "2. Wait a minute for the boot script to finish (docker install), then:"
echo "     ssh -i <your-key>.pem ubuntu@$PUBLIC_IP"
echo "3. Follow infrastructure/aws/app-backend/README.md from 'After the instance boots'."
