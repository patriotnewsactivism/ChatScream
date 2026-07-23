#!/usr/bin/env bash
# One-time setup: installs chatscream as a systemd service that starts on boot
# and restarts automatically on crash.
#
# Usage: sudo bash scripts/setup-autostart.sh
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SERVICE_NAME="chatscream"
SERVICE_SRC="${REPO_DIR}/${SERVICE_NAME}.service"
SYSTEMD_DIR="/etc/systemd/system"

if [[ $EUID -ne 0 ]]; then
  echo "ERROR: This script must be run as root (sudo bash scripts/setup-autostart.sh)"
  exit 1
fi

if [[ ! -f "${SERVICE_SRC}" ]]; then
  echo "ERROR: ${SERVICE_SRC} not found. Make sure you are running from the ChatScream repo."
  exit 1
fi

echo "Installing ${SERVICE_NAME}.service..."
cp "${SERVICE_SRC}" "${SYSTEMD_DIR}/${SERVICE_NAME}.service"

echo "Reloading systemd daemon..."
systemctl daemon-reload

echo "Enabling service (auto-start on boot)..."
systemctl enable "${SERVICE_NAME}"

echo "Starting service now..."
systemctl start "${SERVICE_NAME}"

echo ""
echo "=== Status ==="
systemctl status "${SERVICE_NAME}" --no-pager -l || true

echo ""
echo "Done. Useful commands:"
echo "  View logs:     journalctl -u ${SERVICE_NAME} -f"
echo "  Stop server:   systemctl stop ${SERVICE_NAME}"
echo "  Restart:       systemctl restart ${SERVICE_NAME}"
echo "  Disable boot:  systemctl disable ${SERVICE_NAME}"
