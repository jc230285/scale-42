#!/usr/bin/env bash
# S42 Watchdog — auto-recovery agent for the Coolify VPS.
# Runs every 60s via systemd timer. Detects load/memory/disk problems and
# takes corrective action (restart runaway containers, prune Docker, free
# space). Sends an email when it does something.
#
# Install: see ops/INSTALL.md
set -u
set -o pipefail

# ---------- Config ----------
STATE_DIR=/var/lib/s42-watchdog
LOG_FILE=/var/log/s42-watchdog.log
ALERT_EMAIL="${ALERT_EMAIL:-info@scale-42.com}"
SMTP_HOST="${SMTP_HOST:-smtp.gmail.com}"
SMTP_PORT="${SMTP_PORT:-587}"
SMTP_USER="${SMTP_USER:-}"
SMTP_PASS="${SMTP_PASS:-}"
MAIL_FROM="${MAIL_FROM:-$SMTP_USER}"

# Thresholds
LOAD_PER_CORE_LIMIT=3.0      # 1m load avg per core (3.0 = 300% per core) — sustained
LOAD_TRIGGER_COUNT=3         # how many consecutive 60s ticks above threshold to act
MEM_LIMIT_PCT=92             # used / total memory
DISK_LIMIT_PCT=85            # any partition above this triggers prune
CONTAINER_RESTART_LIMIT=5    # restart count over 10min window
DOCKER_LOG_MAX_BYTES=$((500*1024*1024))  # rotate when >500MB
COOLDOWN_SECONDS=600         # don't repeat the same action within this window

mkdir -p "$STATE_DIR"
touch "$LOG_FILE"

# ---------- Helpers ----------
log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG_FILE"
}

# Track an event; returns 0 if cooldown elapsed (caller may act), else 1
cooldown_ok() {
  local key="$1" cooldown="${2:-$COOLDOWN_SECONDS}"
  local f="$STATE_DIR/cd_${key}"
  if [ -f "$f" ]; then
    local last; last=$(cat "$f" 2>/dev/null || echo 0)
    local now; now=$(date +%s)
    if [ $((now - last)) -lt "$cooldown" ]; then return 1; fi
  fi
  date +%s > "$f"
  return 0
}

inc_counter() {
  local key="$1" max="$2"
  local f="$STATE_DIR/cnt_${key}"
  local cur=0
  [ -f "$f" ] && cur=$(cat "$f" 2>/dev/null || echo 0)
  cur=$((cur + 1))
  echo "$cur" > "$f"
  [ "$cur" -ge "$max" ]
}

reset_counter() {
  rm -f "$STATE_DIR/cnt_$1"
}

send_alert() {
  local subj="$1" body="$2"
  [ -z "$SMTP_USER" ] && { log "alert (no SMTP): $subj"; return; }
  # Use curl SMTP submission. Works with Gmail app-password.
  local boundary; boundary="b$(date +%s)$$"
  local email_file; email_file=$(mktemp)
  cat > "$email_file" <<EOF
From: S42 Watchdog <${MAIL_FROM}>
To: ${ALERT_EMAIL}
Subject: [s42-watchdog] ${subj}
Content-Type: text/plain; charset=utf-8

${body}

--
Host: $(hostname)
Time: $(date -u +%Y-%m-%dT%H:%M:%SZ)
Load: $(awk '{print $1,$2,$3}' /proc/loadavg)
Mem:  $(free -h | awk '/^Mem:/{print $3" / "$2}')
EOF
  curl --silent --show-error --ssl-reqd \
    --url "smtp://${SMTP_HOST}:${SMTP_PORT}" \
    --user "${SMTP_USER}:${SMTP_PASS}" \
    --mail-from "${MAIL_FROM}" \
    --mail-rcpt "${ALERT_EMAIL}" \
    --upload-file "$email_file" >/dev/null 2>&1 \
    && log "alerted: $subj" \
    || log "alert FAILED: $subj"
  rm -f "$email_file"
}

# ---------- Checks ----------

check_load() {
  local cores; cores=$(nproc)
  local load1; load1=$(awk '{print $1}' /proc/loadavg)
  # bash can't do float — use awk
  local per_core; per_core=$(awk -v l="$load1" -v c="$cores" 'BEGIN{printf "%.2f", l/c}')
  local exceeded; exceeded=$(awk -v p="$per_core" -v t="$LOAD_PER_CORE_LIMIT" 'BEGIN{print (p>t)?1:0}')

  if [ "$exceeded" = "1" ]; then
    if inc_counter load "$LOAD_TRIGGER_COUNT"; then
      log "LOAD high: ${load1} (${per_core}/core) for ${LOAD_TRIGGER_COUNT} ticks"
      if cooldown_ok load_action 900; then
        local hog
        hog=$(docker stats --no-stream --format '{{.Container}} {{.Name}} {{.CPUPerc}}' \
              | sort -k3 -h -r | head -1)
        local hog_id; hog_id=$(echo "$hog" | awk '{print $1}')
        local hog_name; hog_name=$(echo "$hog" | awk '{print $2}')
        local hog_cpu; hog_cpu=$(echo "$hog" | awk '{print $3}')
        if [ -n "$hog_id" ]; then
          log "restarting hog container: $hog_name ($hog_id) using $hog_cpu"
          docker restart "$hog_id" >/dev/null 2>&1 && \
            send_alert "Restarted runaway container" "Sustained load ${load1} (${per_core} per core). Top CPU consumer was $hog_name ($hog_id) at $hog_cpu. Container has been restarted."
        fi
      fi
      reset_counter load
    fi
  else
    reset_counter load
  fi
}

check_memory() {
  local used_pct
  used_pct=$(free | awk '/^Mem:/ {printf "%d", ($3/$2)*100}')
  if [ "$used_pct" -ge "$MEM_LIMIT_PCT" ]; then
    log "MEM high: ${used_pct}%"
    if cooldown_ok mem_action 1800; then
      # First: try freeing Docker cruft (often the leak)
      local before; before=$(df --output=avail / | tail -1)
      docker system prune -f --filter "until=24h" >/dev/null 2>&1
      sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
      local after; after=$(df --output=avail / | tail -1)
      send_alert "Memory pressure: pruned Docker + dropped caches" \
                 "Memory was at ${used_pct}% used. Pruned dangling docker images/containers older than 24h. Freed $(awk -v b="$before" -v a="$after" 'BEGIN{printf "%.1f MB", (a-b)/1024}'). If memory stays high after this, a container leak is likely — check docker stats."
    fi
  fi
}

check_disk() {
  local part used
  while read -r part used; do
    used="${used%\%}"
    if [ "$used" -ge "$DISK_LIMIT_PCT" ]; then
      log "DISK high on $part: ${used}%"
      if cooldown_ok "disk_${part//\//_}" 3600; then
        local actions=""
        if [ "$part" = "/" ]; then
          local before; before=$(df --output=avail / | tail -1)
          docker system prune -af --filter "until=72h" >/dev/null 2>&1
          journalctl --vacuum-time=3d >/dev/null 2>&1 || true
          # Truncate runaway docker container logs
          find /var/lib/docker/containers -name "*-json.log" -size +"${DOCKER_LOG_MAX_BYTES}c" \
            -exec truncate -s 0 {} \; 2>/dev/null || true
          local after; after=$(df --output=avail / | tail -1)
          actions="docker prune (>72h), journalctl vacuum 3d, truncated >500MB container logs. Freed $(awk -v b="$before" -v a="$after" 'BEGIN{printf "%.1f MB", (a-b)/1024}')"
        fi
        send_alert "Disk pressure on $part (${used}%)" \
                   "Partition $part hit ${used}% used. Actions: $actions"
      fi
    fi
  done < <(df --output=target,pcent | tail -n +2 | grep -v '/dev\|/sys\|/proc\|/run' | awk '{print $1, $2}')
}

check_crashloop() {
  # Docker reports RestartCount via inspect. Stop any container restarting >N times.
  local id
  for id in $(docker ps -aq); do
    local rc name state
    rc=$(docker inspect -f '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)
    name=$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | sed 's|^/||')
    state=$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null)
    if [ "$rc" -ge "$CONTAINER_RESTART_LIMIT" ] && [ "$state" = "running" ]; then
      if cooldown_ok "crashloop_${id:0:12}" 3600; then
        # Capture last 50 log lines for the alert
        local tail_logs; tail_logs=$(docker logs --tail 50 "$id" 2>&1 | head -50)
        # Mark as stopped (not paused — paused still holds RAM)
        docker update --restart=no "$id" >/dev/null 2>&1
        docker stop "$id" >/dev/null 2>&1
        log "crashloop: stopped $name ($id) at restart_count=$rc"
        send_alert "Stopped crashlooping container: $name" \
                   "$name has restarted $rc times. Auto-restart disabled and container stopped to free resources. Manual investigation required. Last logs:\n\n$tail_logs"
      fi
    fi
  done
}

heartbeat() {
  echo "$(date +%s)" > "$STATE_DIR/heartbeat"
}

# ---------- Run ----------
heartbeat
check_load
check_memory
check_disk
check_crashloop

# Self-healing: if Docker daemon itself is down, try to restart
if ! systemctl is-active --quiet docker; then
  if cooldown_ok docker_restart 1800; then
    log "docker daemon down — restarting"
    systemctl restart docker
    send_alert "Docker daemon restarted" "The docker.service was inactive. Auto-restarted it. Check Coolify dashboard once it stabilises."
  fi
fi

exit 0
