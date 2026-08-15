#!/usr/bin/env bash
# ChatScream app-backend EC2 bootstrap.
#
# Installs Docker + the Compose plugin only. Deliberately does NOT clone the
# repo or write secrets here — EC2 instance metadata (and therefore user-data)
# is readable by anything with IMDS access on the box, so OAuth/DB secrets
# don't belong in it. Clone the repo and create .env by hand over SSH after
# boot — see infrastructure/aws/app-backend/README.md for the exact steps.

set -euo pipefail

exec > >(tee -a /var/log/chatscream-app-backend-user-data.log) 2>&1

echo "Starting ChatScream app-backend bootstrap at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"

export DEBIAN_FRONTEND=noninteractive

apt-get update -y
apt-get install -y --no-install-recommends \
  ca-certificates \
  curl \
  git \
  gnupg

install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc

# shellcheck disable=SC1091
. /etc/os-release
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
  > /etc/apt/sources.list.d/docker.list

apt-get update -y
apt-get install -y --no-install-recommends \
  docker-ce \
  docker-ce-cli \
  containerd.io \
  docker-buildx-plugin \
  docker-compose-plugin

systemctl enable docker
systemctl start docker

mkdir -p /opt/chatscream
if id ubuntu >/dev/null 2>&1; then
  usermod -aG docker ubuntu
  chown -R ubuntu:ubuntu /opt/chatscream
fi

echo "ChatScream app-backend bootstrap completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Next: SSH in, clone the repo into /opt/chatscream, create .env, and run:"
echo "  cd /opt/chatscream/infrastructure/aws/app-backend && docker compose -f docker-compose.prod.yml up -d --build"
