#!/usr/bin/env bash
# Deploy or update ChatScream EC2 autoscaling stream workers on AWS.

set -euo pipefail

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERR] Missing required command: $1"
    exit 1
  fi
}

require_cmd aws
require_cmd jq
require_cmd base64

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
USER_DATA_FILE="${USER_DATA_FILE:-$SCRIPT_DIR/scripts/ec2-user-data.sh}"
CONFIG_FILE="${CONFIG_FILE:-$SCRIPT_DIR/.env.aws}"

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
SUBNET_IDS="${SUBNET_IDS:-}"
LAUNCH_TEMPLATE_NAME="${LAUNCH_TEMPLATE_NAME:-chatscream-ffmpeg-lt}"
ASG_NAME="${ASG_NAME:-chatscream-ffmpeg-asg}"
SECURITY_GROUP_NAME="${SECURITY_GROUP_NAME:-chatscream-ffmpeg-sg}"
SECURITY_GROUP_ID="${SECURITY_GROUP_ID:-}"
INSTANCE_TYPE="${INSTANCE_TYPE:-c7g.large}"
INSTANCE_PROFILE_NAME="${INSTANCE_PROFILE_NAME:-}"
AMI_ID="${AMI_ID:-}"
MIN_SIZE="${MIN_SIZE:-0}"
DESIRED_CAPACITY="${DESIRED_CAPACITY:-0}"
MAX_SIZE="${MAX_SIZE:-20}"
TARGET_CPU_PERCENT="${TARGET_CPU_PERCENT:-55}"

if [[ -z "$VPC_ID" ]]; then
  echo "[ERR] VPC_ID is required."
  exit 1
fi

if [[ -z "$SUBNET_IDS" ]]; then
  echo "[ERR] SUBNET_IDS is required (comma-separated)."
  exit 1
fi

if [[ -z "$AMI_ID" ]]; then
  if [[ "$INSTANCE_TYPE" == c7g* || "$INSTANCE_TYPE" == t4g* ]]; then
    SSM_AMI_PARAM="/aws/service/canonical/ubuntu/server/22.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
  else
    SSM_AMI_PARAM="/aws/service/canonical/ubuntu/server/22.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
  fi
  AMI_ID="$(
    aws ssm get-parameter \
      --region "$AWS_REGION" \
      --name "$SSM_AMI_PARAM" \
      --query 'Parameter.Value' \
      --output text
  )"
fi

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
        --description "ChatScream FFmpeg stream workers" \
        --vpc-id "$VPC_ID" \
        --query 'GroupId' \
        --output text
    )"

    aws ec2 authorize-security-group-ingress \
      --region "$AWS_REGION" \
      --group-id "$SECURITY_GROUP_ID" \
      --ip-permissions \
      '[
        {"IpProtocol":"tcp","FromPort":22,"ToPort":22,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"SSH (restrict in production)"}]},
        {"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"HTTP/HLS"}]},
        {"IpProtocol":"tcp","FromPort":1935,"ToPort":1935,"IpRanges":[{"CidrIp":"0.0.0.0/0","Description":"RTMP ingest"}]}
      ]' >/dev/null
  fi
fi

USER_DATA_B64="$(
  base64 < "$USER_DATA_FILE" | tr -d '\n'
)"

LAUNCH_TEMPLATE_DATA="$(
  jq -n \
    --arg imageId "$AMI_ID" \
    --arg instanceType "$INSTANCE_TYPE" \
    --arg securityGroup "$SECURITY_GROUP_ID" \
    --arg userData "$USER_DATA_B64" \
    --arg instanceProfileName "$INSTANCE_PROFILE_NAME" \
    '{
      ImageId: $imageId,
      InstanceType: $instanceType,
      SecurityGroupIds: [$securityGroup],
      UserData: $userData,
      MetadataOptions: { HttpEndpoint: "enabled", HttpTokens: "required" },
      BlockDeviceMappings: [
        {
          DeviceName: "/dev/sda1",
          Ebs: {
            DeleteOnTermination: true,
            Encrypted: true,
            VolumeType: "gp3",
            VolumeSize: 40
          }
        }
      ],
      TagSpecifications: [
        {
          ResourceType: "instance",
          Tags: [
            { Key: "Name", Value: "chatscream-ffmpeg-worker" },
            { Key: "Service", Value: "chatscream-streaming" }
          ]
        }
      ]
    }
    | if $instanceProfileName != "" then
        . + { IamInstanceProfile: { Name: $instanceProfileName } }
      else
        .
      end'
)"

if aws ec2 describe-launch-templates \
  --region "$AWS_REGION" \
  --launch-template-names "$LAUNCH_TEMPLATE_NAME" >/dev/null 2>&1; then
  aws ec2 create-launch-template-version \
    --region "$AWS_REGION" \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --source-version '$Latest' \
    --version-description "updated-$(date -u +"%Y%m%d%H%M%S")" \
    --launch-template-data "$LAUNCH_TEMPLATE_DATA" >/dev/null
else
  aws ec2 create-launch-template \
    --region "$AWS_REGION" \
    --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
    --version-description "initial" \
    --launch-template-data "$LAUNCH_TEMPLATE_DATA" >/dev/null
fi

LATEST_LT_VERSION="$(
  aws ec2 describe-launch-templates \
    --region "$AWS_REGION" \
    --launch-template-names "$LAUNCH_TEMPLATE_NAME" \
    --query 'LaunchTemplates[0].LatestVersionNumber' \
    --output text
)"

aws ec2 modify-launch-template \
  --region "$AWS_REGION" \
  --launch-template-name "$LAUNCH_TEMPLATE_NAME" \
  --default-version "$LATEST_LT_VERSION" >/dev/null

ASG_EXISTS="$(
  aws autoscaling describe-auto-scaling-groups \
    --region "$AWS_REGION" \
    --auto-scaling-group-names "$ASG_NAME" \
    --query 'AutoScalingGroups[0].AutoScalingGroupName' \
    --output text
)"

if [[ "$ASG_EXISTS" == "$ASG_NAME" ]]; then
  aws autoscaling update-auto-scaling-group \
    --region "$AWS_REGION" \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=\$Default" \
    --min-size "$MIN_SIZE" \
    --desired-capacity "$DESIRED_CAPACITY" \
    --max-size "$MAX_SIZE" \
    --vpc-zone-identifier "$SUBNET_IDS" >/dev/null
else
  aws autoscaling create-auto-scaling-group \
    --region "$AWS_REGION" \
    --auto-scaling-group-name "$ASG_NAME" \
    --launch-template "LaunchTemplateName=$LAUNCH_TEMPLATE_NAME,Version=\$Default" \
    --min-size "$MIN_SIZE" \
    --desired-capacity "$DESIRED_CAPACITY" \
    --max-size "$MAX_SIZE" \
    --vpc-zone-identifier "$SUBNET_IDS" \
    --health-check-type EC2 \
    --health-check-grace-period 300 \
    --tags "Key=Name,Value=chatscream-ffmpeg-worker,PropagateAtLaunch=true" \
           "Key=Service,Value=chatscream-streaming,PropagateAtLaunch=true" >/dev/null
fi

TARGET_TRACKING="$(
  jq -n \
    --argjson target "$TARGET_CPU_PERCENT" \
    '{
      TargetValue: $target,
      DisableScaleIn: false,
      PredefinedMetricSpecification: {
        PredefinedMetricType: "ASGAverageCPUUtilization"
      }
    }'
)"

aws autoscaling put-scaling-policy \
  --region "$AWS_REGION" \
  --auto-scaling-group-name "$ASG_NAME" \
  --policy-name "${ASG_NAME}-cpu-target" \
  --policy-type TargetTrackingScaling \
  --target-tracking-configuration "$TARGET_TRACKING" >/dev/null

echo
echo "ChatScream stream fleet deployed."
echo "Region:               $AWS_REGION"
echo "Launch template:      $LAUNCH_TEMPLATE_NAME (v$LATEST_LT_VERSION)"
echo "Auto Scaling Group:   $ASG_NAME"
echo "Security Group:       $SECURITY_GROUP_ID"
echo "Instance type:        $INSTANCE_TYPE"
echo "Capacity (min/des/max): $MIN_SIZE / $DESIRED_CAPACITY / $MAX_SIZE"
echo
echo "RTMP ingest format:   rtmp://<worker-public-ip>:1935/live/<stream-key>"
echo "HLS playback format:  http://<worker-public-ip>/hls/<stream-key>.m3u8"
