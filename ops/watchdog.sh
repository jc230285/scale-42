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

# Thresholds — tuned aggressive so we act WELL BEFORE the host hits OOM territory
LOAD_PER_CORE_LIMIT=2.0      # 1m load avg per core (2.0 = 200% per core) — sustained
LOAD_TRIGGER_COUNT=2         # how many consecutive 60s ticks above threshold to act

# Memory thresholds — staged escalation so we act long before OOM:
MEM_WARN_PCT=75              # warn + identify hog (no action yet, info-only)
MEM_ACT_PCT=82               # restart the biggest memory-hog container
MEM_PANIC_PCT=90             # additionally prune Docker + drop caches as last resort

# Swap pressure — if we're paging this hard, OOM is imminent
SWAP_USED_PCT=50             # acceptable swap-used % before we treat as pressure
SWAP_IO_KB_PER_S=5000        # sustained si+so KB/s indicating thrash

DISK_LIMIT_PCT=80            # any partition above this triggers prune
CONTAINER_RESTART_LIMIT=5    # restart count over 10min window
DOCKER_LOG_MAX_BYTES=$((500*1024*1024))  # rotate when >500MB
COOLDOWN_SECONDS=600         # don't repeat the same action within this window
DOCKER_CMD_TIMEOUT=10        # never let a docker call hang the watchdog
OOM_LOOKBACK_SECS=180        # check journal for OOM events within last N seconds

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
        hog=$(timeout "${DOCKER_CMD_TIMEOUT}s" docker stats --no-stream --format '{{.Container}} {{.Name}} {{.CPUPerc}}' \
              | sort -k3 -h -r | head -1)
        local hog_id; hog_id=$(echo "$hog" | awk '{print $1}')
        local hog_name; hog_name=$(echo "$hog" | awk '{print $2}')
        local hog_cpu; hog_cpu=$(echo "$hog" | awk '{print $3}')
        if [ -n "$hog_id" ]; then
          log "restarting hog container: $hog_name ($hog_id) using $hog_cpu"
          timeout 30s docker restart "$hog_id" >/dev/null 2>&1 && \
            send_alert "Restarted runaway container" "Sustained load ${load1} (${per_core} per core). Top CPU consumer was $hog_name ($hog_id) at $hog_cpu. Container has been restarted."
        fi
      fi
      reset_counter load
    fi
  else
    reset_counter load
  fi
}

top_mem_container() {
  # Returns: "<id> <name> <mem_mb> <mem_pct>" for the highest-memory container,
  # or empty if docker stats failed.
  timeout "${DOCKER_CMD_TIMEOUT}s" docker stats --no-stream --format \
    '{{.Container}} {{.Name}} {{.MemUsage}} {{.MemPerc}}' 2>/dev/null \
  | awk '{
      # MemUsage is "123.4MiB / 4GiB" — take just the numeric prefix in MiB
      u=$3; sub(/MiB.*/,"",u); sub(/GiB.*/,"",u);
      if ($3 ~ /GiB/) u = u * 1024;
      print $1, $2, u, $NF
    }' \
  | sort -k3 -n -r | head -1
}

check_memory() {
  # Read /proc/meminfo for true used (MemTotal - MemAvailable)
  local mem_total mem_avail used_pct
  mem_total=$(awk '/^MemTotal:/{print $2}' /proc/meminfo)
  mem_avail=$(awk '/^MemAvailable:/{print $2}' /proc/meminfo)
  used_pct=$(awk -v t="$mem_total" -v a="$mem_avail" 'BEGIN{printf "%d", ((t-a)/t)*100}')

  # Stage 1: WARN — log only, prepare context
  if [ "$used_pct" -lt "$MEM_WARN_PCT" ]; then
    reset_counter mem_warn
    return
  fi

  # Stage 2: ACT — restart the biggest memory hog
  if [ "$used_pct" -ge "$MEM_ACT_PCT" ]; then
    log "MEM act: ${used_pct}% used"
    if cooldown_ok mem_action 900; then
      local hog hog_id hog_name hog_mem hog_pct
      hog=$(top_mem_container)
      hog_id=$(echo "$hog" | awk '{print $1}')
      hog_name=$(echo "$hog" | awk '{print $2}')
      hog_mem=$(echo "$hog" | awk '{printf "%.0f MB", $3}')
      hog_pct=$(echo "$hog" | awk '{print $4}')

      if [ -n "$hog_id" ]; then
        log "restarting top mem container: $hog_name ($hog_id) using $hog_mem ($hog_pct)"
        timeout 30s docker restart "$hog_id" >/dev/null 2>&1
        send_alert "Pre-OOM: restarted memory-hog container" \
                   "Memory was at ${used_pct}% used. Top container: $hog_name ($hog_id) using $hog_mem ($hog_pct). Restarted it to free RAM before OOM could fire. Investigate this app for a leak."
      fi
    fi
  fi

  # Stage 3: PANIC — last resort, prune everything + drop caches
  if [ "$used_pct" -ge "$MEM_PANIC_PCT" ]; then
    log "MEM panic: ${used_pct}%"
    if cooldown_ok mem_panic 1800; then
      local before; before=$(df --output=avail / | tail -1)
      timeout 60s docker system prune -f --filter "until=24h" >/dev/null 2>&1
      sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
      local after; after=$(df --output=avail / | tail -1)
      send_alert "OOM imminent: emergency cleanup" \
                 "Memory ${used_pct}%. Pruned Docker + dropped caches. Freed $(awk -v b="$before" -v a="$after" 'BEGIN{printf "%.1f MB", (a-b)/1024}'). If this recurs the VPS needs resizing."
    fi
  fi
}

check_swap_pressure() {
  # Heavy swap I/O = imminent OOM thrash
  local swap_total swap_used pct
  swap_total=$(awk '/^SwapTotal:/{print $2}' /proc/meminfo)
  swap_used=$(awk '/^SwapTotal:/{t=$2} /^SwapFree:/{f=$2; print t-f}' /proc/meminfo)
  [ "${swap_total:-0}" -eq 0 ] && return
  pct=$(awk -v u="$swap_used" -v t="$swap_total" 'BEGIN{printf "%d", (u/t)*100}')

  if [ "$pct" -ge "$SWAP_USED_PCT" ]; then
    log "SWAP high: ${pct}% used"
    if cooldown_ok swap_action 1800; then
      local hog; hog=$(top_mem_container)
      local hog_id hog_name
      hog_id=$(echo "$hog" | awk '{print $1}')
      hog_name=$(echo "$hog" | awk '{print $2}')
      if [ -n "$hog_id" ]; then
        log "swap-thrash: restarting $hog_name ($hog_id)"
        timeout 30s docker restart "$hog_id" >/dev/null 2>&1
        send_alert "Swap pressure: restarted hog" \
                   "Swap at ${pct}% used — system thrashing to disk. Restarted top memory consumer: $hog_name ($hog_id)."
      fi
    fi
  fi
}

check_oom_events() {
  # Look at journalctl for OOM kills since last check.
  # The kernel logs lines like:
  #   "Out of memory: Killed process 50877 (uvicorn) total-vm:1726268kB, anon-rss:875308kB"
  local since="${OOM_LOOKBACK_SECS} seconds ago"
  local oom_lines
  oom_lines=$(timeout 10s journalctl --since "$since" -k --no-pager 2>/dev/null \
              | grep -E "Out of memory: Killed process|oom-kill:invoked" | tail -20)
  [ -z "$oom_lines" ] && return

  # Dedupe by hash so we only alert once per event
  local hash; hash=$(echo "$oom_lines" | md5sum | cut -c1-12)
  local marker="$STATE_DIR/oom_seen_$hash"
  [ -f "$marker" ] && return
  touch "$marker"

  # Extract victim names for the alert + remediation
  local victims
  victims=$(echo "$oom_lines" | grep -oE "Killed process [0-9]+ \([^)]+\)" \
            | sed 's/Killed process [0-9]* (\(.*\))/\1/' | sort -u | tr '\n' ',' | sed 's/,$//')

  log "OOM detected; victims: $victims"

  # Find which docker containers are now stopped (likely the OOM victims) and restart them
  local stopped restarted_list=""
  stopped=$(timeout "${DOCKER_CMD_TIMEOUT}s" docker ps -a --filter 'status=exited' --filter 'status=dead' \
            --format '{{.ID}} {{.Names}} {{.Status}}' 2>/dev/null)
  if [ -n "$stopped" ]; then
    while IFS= read -r line; do
      local id name
      id=$(echo "$line" | awk '{print $1}')
      name=$(echo "$line" | awk '{print $2}')
      # Only restart if exit was recent (within OOM_LOOKBACK_SECS)
      local finished_at
      finished_at=$(timeout 5s docker inspect -f '{{.State.FinishedAt}}' "$id" 2>/dev/null)
      local finished_epoch now_epoch
      finished_epoch=$(date -d "$finished_at" +%s 2>/dev/null || echo 0)
      now_epoch=$(date +%s)
      if [ $((now_epoch - finished_epoch)) -lt "$OOM_LOOKBACK_SECS" ]; then
        log "restarting OOM victim container: $name ($id)"
        timeout 30s docker start "$id" >/dev/null 2>&1 && restarted_list+="${name} "
      fi
    done <<< "$stopped"
  fi

  # Memory snapshot for the alert
  local mem_snap
  mem_snap=$(free -m | awk '/^Mem:/{printf "%d MB used / %d MB total", $3, $2}')

  send_alert "OOM detected — victims: ${victims:-unknown}" \
"Kernel killed processes due to memory pressure.

Victims (process names): ${victims:-unknown}
Containers auto-restarted: ${restarted_list:-none}
Current memory: $mem_snap

Recent kernel OOM lines:
$oom_lines

Root cause: a container is leaking memory faster than the host can reclaim. Recommended next steps:
  1. Identify the leaker via: docker stats --no-stream
  2. Set a Docker memory limit on the offending app in Coolify (--memory=512m or similar)
  3. If multiple containers are large, the VPS is undersized — bump from CPX22 (4 GB) to CPX31 (8 GB)."
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
          timeout 120s docker system prune -af --filter "until=72h" >/dev/null 2>&1
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
  for id in $(timeout "${DOCKER_CMD_TIMEOUT}s" docker ps -aq 2>/dev/null); do
    local rc name state
    rc=$(docker inspect -f '{{.RestartCount}}' "$id" 2>/dev/null || echo 0)
    name=$(docker inspect -f '{{.Name}}' "$id" 2>/dev/null | sed 's|^/||')
    state=$(docker inspect -f '{{.State.Status}}' "$id" 2>/dev/null)
    if [ "$rc" -ge "$CONTAINER_RESTART_LIMIT" ] && [ "$state" = "running" ]; then
      if cooldown_ok "crashloop_${id:0:12}" 3600; then
        # Capture last 50 log lines for the alert
        local tail_logs; tail_logs=$(docker logs --tail 50 "$id" 2>&1 | head -50)
        # Mark as stopped (not paused — paused still holds RAM)
        timeout 10s docker update --restart=no "$id" >/dev/null 2>&1
        timeout 30s docker stop "$id" >/dev/null 2>&1
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
check_oom_events      # FIRST — detect & recover from OOM that already happened
check_memory          # proactive: act at 82%, panic at 90%
check_swap_pressure   # catch swap-thrash before it locks the host
check_load
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
