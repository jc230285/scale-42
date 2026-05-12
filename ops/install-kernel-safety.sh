#!/usr/bin/env bash
# Kernel-level safety nets: OS hard-reboots itself when userland hangs or OOMs.
# Run on the VPS as root once.
set -euo pipefail
if [ "$EUID" -ne 0 ]; then echo "Run as root."; exit 1; fi

# 1. Panic on OOM so the kernel reboots instead of leaving a half-dead userland
cat > /etc/sysctl.d/90-s42-safety.conf <<'EOF'
# Panic and reboot 10s after a kernel panic
kernel.panic = 10
kernel.panic_on_oops = 1

# Panic if any OOM kill happens (Linux is too lenient by default)
vm.panic_on_oom = 1

# Reboot on hung task — kernel will detect a task stuck in D state >120s
kernel.hung_task_panic = 1
kernel.hung_task_timeout_secs = 120

# Less aggressive swap = fewer disk thrashing events
vm.swappiness = 10

# Allow more memory headroom before reclaim
vm.min_free_kbytes = 131072
EOF
sysctl --system >/dev/null

# 2. systemd watchdog — kernel will reboot if systemd doesn't ping it
mkdir -p /etc/systemd/system.conf.d
cat > /etc/systemd/system.conf.d/99-s42-watchdog.conf <<'EOF'
[Manager]
RuntimeWatchdogSec=60s
ShutdownWatchdogSec=10min
EOF

# 3. Add swap if missing (helps absorb spikes without thrashing the SSD)
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -qE "^/swapfile" /etc/fstab || echo "/swapfile none swap sw 0 0" >> /etc/fstab
  echo "Added 2G swap"
fi

# 4. Configure Docker to limit log size per container (prevents disk fill)
mkdir -p /etc/docker
if [ ! -f /etc/docker/daemon.json ]; then
  cat > /etc/docker/daemon.json <<'EOF'
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  },
  "default-ulimits": {
    "nofile": { "Name": "nofile", "Hard": 65536, "Soft": 65536 }
  }
}
EOF
  systemctl restart docker
  echo "Configured Docker log rotation (50m × 3 files per container)"
else
  echo "/etc/docker/daemon.json already exists — review manually for log-opts"
fi

# Reload systemd to pick up watchdog config (does not require reboot)
systemctl daemon-reexec

echo ""
echo "Kernel safety nets installed:"
echo "  • kernel.panic = 10 (auto-reboot 10s after panic)"
echo "  • vm.panic_on_oom = 1 (reboot on OOM kill)"
echo "  • kernel.hung_task_panic = 1 (reboot on D-state task >120s)"
echo "  • systemd RuntimeWatchdogSec=60s (kernel reboots if systemd hangs)"
echo "  • 2G swap added (if missing)"
echo "  • Docker log rotation 50m × 3"
echo ""
echo "These take effect immediately. Some require reboot to fully apply:"
echo "  systemctl reboot"
