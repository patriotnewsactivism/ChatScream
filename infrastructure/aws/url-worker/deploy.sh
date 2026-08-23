#!/usr/bin/env bash
set -euo pipefail

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "Missing required command: $1" >&2; exit 1; }
}

require aws
require sam
require python3

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
STACK_NAME="${STACK_NAME:-chatscream-url-worker}"
AWS_REGION="${AWS_REGION:-us-east-1}"
VPC_ID="${VPC_ID:-}"
SUBNET_IDS="${SUBNET_IDS:-}"
WORKER_INSTANCE_TYPE="${WORKER_INSTANCE_TYPE:-c7g.large}"
MAX_CONCURRENT_JOBS="${MAX_CONCURRENT_JOBS:-20}"
CLOUD_WORKER_API_TOKEN="${CLOUD_WORKER_API_TOKEN:-}"
WORKER_GIT_REF="${WORKER_GIT_REF:-$(git -C "$REPO_ROOT" rev-parse HEAD 2>/dev/null || echo main)}"

if [[ -z "$VPC_ID" || -z "$SUBNET_IDS" ]]; then
  echo "Set VPC_ID and SUBNET_IDS (comma-separated public subnet IDs)." >&2
  exit 1
fi
if [[ -z "$CLOUD_WORKER_API_TOKEN" ]]; then
  echo "Set CLOUD_WORKER_API_TOKEN to a strong random secret before deployment." >&2
  exit 1
fi

TOKEN_SHA="$(python3 - <<'PY'
import hashlib, os
print(hashlib.sha256(os.environ['CLOUD_WORKER_API_TOKEN'].encode()).hexdigest())
PY
)"

OWNER_REPO="patriotnewsactivism/ChatScream"
WORKER_CODE_URL="https://raw.githubusercontent.com/${OWNER_REPO}/${WORKER_GIT_REF}/infrastructure/aws/url-worker/worker.py"

case "$WORKER_INSTANCE_TYPE" in
  c6i.*)
    AMI_PARAM="/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id"
    ;;
  *)
    AMI_PARAM="/aws/service/canonical/ubuntu/server/24.04/stable/current/arm64/hvm/ebs-gp3/ami-id"
    ;;
esac

IFS=',' read -r -a SUBNET_ARRAY <<< "$SUBNET_IDS"
SUBNET_PARAM="$(IFS=,; echo "${SUBNET_ARRAY[*]}")"

pushd "$SCRIPT_DIR" >/dev/null
sam build
sam deploy \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --no-confirm-changeset \
  --no-fail-on-empty-changeset \
  --parameter-overrides \
    "VpcId=$VPC_ID" \
    "SubnetIds=$SUBNET_PARAM" \
    "ControlTokenSha256=$TOKEN_SHA" \
    "WorkerCodeUrl=$WORKER_CODE_URL" \
    "WorkerInstanceType=$WORKER_INSTANCE_TYPE" \
    "WorkerAmiId=$AMI_PARAM" \
    "MaxConcurrentJobs=$MAX_CONCURRENT_JOBS"
popd >/dev/null

API_URL="$(aws cloudformation describe-stacks \
  --stack-name "$STACK_NAME" \
  --region "$AWS_REGION" \
  --query "Stacks[0].Outputs[?OutputKey=='WorkerApiUrl'].OutputValue | [0]" \
  --output text)"

echo
echo "ChatScream URL worker deployed."
echo "API: $API_URL"
echo "Worker source pinned to: $WORKER_GIT_REF"
echo
echo "Next production env values:"
echo "  CLOUD_WORKER_API_URL=$API_URL"
echo "  CLOUD_WORKER_API_TOKEN=<same secret supplied to this deploy>"
echo
echo "Health check:"
echo "  curl -H 'Authorization: Bearer <token>' '$API_URL/health'"
