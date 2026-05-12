#!/usr/bin/env bash
# Run on the VPS as root to install the S42 Watchdog.
# Copy this whole repo (or just ops/) to the server first.
#
#   ssh root@88.198.89.110
#   cd /tmp && git clone https://github.com/jc230285/scale-42.git
#   cd scale-42/ops && bash install-watchdog.sh
#
set -euo pipefail

if [ "$EUID" -ne 0 ]; then echo "Run as root."; exit 1; fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)

# 1. Install the script
install -m 0755 "$SCRIPT_DIR/watchdog.sh" /usr/local/bin/s42-watchdog.sh
echo "Installed /usr/local/bin/s42-watchdog.sh"

# 2. Install env file (only if missing — don't clobber existing secrets)
if [ ! -f /etc/s42-watchdog.env ]; then
  install -m 0600 "$SCRIPT_DIR/s42-watchdog.env.sample" /etc/s42-watchdog.env
  echo "Installed /etc/s42-watchdog.env — REVIEW AND EDIT secrets if needed"
else
  echo "Skipped /etc/s42-watchdog.env — file already exists"
fi

# 3. Install systemd units
install -m 0644 "$SCRIPT_DIR/s42-watchdog.service" /etc/systemd/system/s42-watchdog.service
install -m 0644 "$SCRIPT_DIR/s42-watchdog.timer"   /etc/systemd/system/s42-watchdog.timer
systemctl daemon-reload

# 4. Enable + start timer
systemctl enable --now s42-watchdog.timer
echo ""
echo "S42 Watchdog installed and running."
echo ""
echo "Useful commands:"
echo "  systemctl status  s42-watchdog.timer"
echo "  systemctl list-timers --all | grep s42"
echo "  journalctl -u s42-watchdog.service -f"
echo "  tail -f /var/log/s42-watchdog.log"
echo "  # Trigger an immediate run:"
echo "  systemctl start s42-watchdog.service"
