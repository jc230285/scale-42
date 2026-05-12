#!/usr/bin/env bash
# Apply Docker memory limits to every running container so a leaker is killed
# by Docker (single container restart) rather than by the kernel OOM (which
# can take out unrelated processes and starve the whole host).
#
# Run on the VPS as root once. Idempotent — only adds a limit where none is set.
# Default per-container limit: 512 MB. Override per-name with PROFILES below.
set -euo pipefail
if [ "$EUID" -ne 0 ]; then echo "Run as root."; exit 1; fi

DEFAULT_LIMIT="512m"

# Per-container overrides — adjust based on docker stats. Example:
#   PROFILES["coolify-proxy"]="256m"
#   PROFILES["scale-42-prod-*"]="384m"
declare -A PROFILES
PROFILES["coolify"]="1g"          # Coolify itself needs more
PROFILES["coolify-db"]="512m"
PROFILES["coolify-redis"]="128m"
PROFILES["coolify-proxy"]="256m"
PROFILES["coolify-realtime"]="128m"

limit_for() {
  local name="$1"
  for pattern in "${!PROFILES[@]}"; do
    if [[ "$name" == $pattern* ]]; then
      echo "${PROFILES[$pattern]}"
      return
    fi
  done
  echo "$DEFAULT_LIMIT"
}

applied=0; skipped=0; failed=0

while IFS= read -r line; do
  id=$(echo "$line" | awk '{print $1}')
  name=$(echo "$line" | awk '{print $2}')
  cur=$(docker inspect -f '{{.HostConfig.Memory}}' "$id" 2>/dev/null || echo 0)

  if [ "$cur" != "0" ]; then
    echo "✓ $name already has limit ($(numfmt --to=iec --suffix=B "$cur" 2>/dev/null || echo "$cur bytes")) — skipping"
    skipped=$((skipped+1))
    continue
  fi

  limit=$(limit_for "$name")
  if docker update --memory "$limit" --memory-swap "$limit" "$id" >/dev/null 2>&1; then
    echo "→ $name: set memory limit $limit"
    applied=$((applied+1))
  else
    echo "✗ $name: failed to set limit"
    failed=$((failed+1))
  fi
done < <(docker ps --format '{{.ID}} {{.Names}}')

echo ""
echo "Applied: $applied  Skipped (already set): $skipped  Failed: $failed"
echo ""
echo "Note: limits are not persistent across container recreate (docker update only)."
echo "      For permanent limits, set 'mem_limit' in Coolify per-app or in the compose file."
