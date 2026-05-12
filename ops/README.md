# S42 Watchdog

Self-healing VPS agent. Runs every 60s as a systemd timer on the Coolify host and takes corrective action when load, memory, disk, or container health goes bad. Emails you when it does something.

## What it does

| Symptom | Detection | Action |
|---|---|---|
| Sustained high load | 1-min loadavg per core > 3.0 for 3 consecutive checks | Identifies the worst CPU-consuming container via `docker stats` and `docker restart`s it |
| Memory exhaustion | RAM used > 92% | Runs `docker system prune` (>24h dangling) + drops kernel page caches |
| Disk pressure | Any partition > 85% full | `docker system prune -af` (>72h), `journalctl --vacuum-time=3d`, truncates container logs >500MB |
| Crashlooping container | RestartCount ≥ 5 | Disables auto-restart and stops the container, preserving the host |
| Docker daemon down | `systemctl is-active docker` returns false | `systemctl restart docker` |

Every action triggers an email to `info@scale-42.com` via the same Gmail SMTP the contact form uses.

## Files

- `watchdog.sh` — the main script
- `s42-watchdog.service` — systemd unit (one-shot)
- `s42-watchdog.timer` — runs the unit every 60s
- `s42-watchdog.env.sample` — sample env config (copy to `/etc/s42-watchdog.env`)
- `install-watchdog.sh` — root install script

## Cooldowns (so we don't act in a loop)

- Container restart: 15 min between actions
- Memory prune: 30 min
- Disk prune: 60 min per partition
- Docker daemon restart: 30 min
- Crashloop stop: 60 min per container

## Install

After the VPS is back online:

```bash
ssh root@88.198.89.110
cd /tmp && git clone https://github.com/jc230285/scale-42.git
cd scale-42/ops
bash install-watchdog.sh
```

The installer:
1. Copies `watchdog.sh` to `/usr/local/bin/s42-watchdog.sh`
2. Copies the env file to `/etc/s42-watchdog.env` (mode 0600, only if missing)
3. Installs systemd units and enables the timer

## Verify

```bash
systemctl status s42-watchdog.timer       # active (waiting)
systemctl list-timers --all | grep s42    # next run time
tail -f /var/log/s42-watchdog.log         # what it's doing
journalctl -u s42-watchdog.service -f     # live journal
```

To force an immediate run:

```bash
systemctl start s42-watchdog.service
```

## Tuning

Edit `/usr/local/bin/s42-watchdog.sh`, change the `Config` block at the top:

- `LOAD_PER_CORE_LIMIT` — raise if you legitimately spike CPU during builds
- `LOAD_TRIGGER_COUNT` — how many 60s ticks before acting (3 = ~3 min sustained)
- `MEM_LIMIT_PCT` — memory action threshold
- `DISK_LIMIT_PCT` — disk action threshold
- `COOLDOWN_SECONDS` — base cooldown between actions

Then `systemctl restart s42-watchdog.timer` is not needed — the next tick picks up the new script.

## Safety

- All actions are bounded by cooldowns so the watchdog can't thrash.
- The watchdog itself is `CPUQuota=50%` and `MemoryMax=128M` so it never becomes the problem.
- It never deletes data — only prunes Docker dangling images, rotates logs, restarts containers.
- It never modifies application config or env vars.
- All actions are logged to `/var/log/s42-watchdog.log` and emailed.

## Why not an LLM agent?

For host-level recovery, deterministic rules win: faster, free, no API failure modes, no API key on the VPS. The rules above cover the failure modes Coolify hosts actually hit. If we later want an LLM in the loop, the natural place is **after** the watchdog has stabilised the host, to suggest root-cause and longer-term fixes (e.g. resize the VPS, add swap, refactor a container).
