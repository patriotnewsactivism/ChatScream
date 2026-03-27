#!/usr/bin/env bash
# One-time setup: installs chatscream as an init.d service that starts on boot
# and makes it easy to restart/check logs.
#
# Usage: sudo bash scripts/setup-autostart.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="chatscream"
INITD_DIR="/etc/init.d"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (sudo bash scripts/setup-autostart.sh)"
  exit 1
fi

if [[ ! -f "${INITD_DIR}/${SERVICE_NAME}" ]]; then
  echo "ERROR: ${INITD_DIR}/${SERVICE_NAME} not found."
  echo "Make sure the init.d script was installed. You may need to run this from the server."
  exit 1
fi

# Install npm dependencies if missing
if [[ ! -d "${REPO_DIR}/node_modules" ]]; then
  echo "Installing npm dependencies..."
  cd "${REPO_DIR}" && npm install
fi

echo "Registering ${SERVICE_NAME} for auto-start on boot..."
update-rc.d "${SERVICE_NAME}" defaults

echo "Starting service now..."
service "${SERVICE_NAME}" start

echo ""
echo "=== Status ==="
service "${SERVICE_NAME}" status || true

echo ""
echo "Done. Useful commands:"
echo "  View logs:    service ${SERVICE_NAME} logs  (or: tail -f /var/log/${SERVICE_NAME}.log)"
echo "  Stop server:  service ${SERVICE_NAME} stop"
echo "  Restart:      service ${SERVICE_NAME} restart"
echo "  Status:       service ${SERVICE_NAME} status"
