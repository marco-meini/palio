#!/usr/bin/env bash
# Tunnel SSH verso Postgres sul VPS (bind locale 127.0.0.1:9634).
# Uso: ./docker/ssh-tunnel-db.sh
set -euo pipefail

SSH_HOST="${SSH_HOST:-m.meini@54.37.156.45}"
LOCAL_PORT="${LOCAL_PORT:-9634}"
REMOTE_PORT="${REMOTE_PORT:-9634}"

if nc -z 127.0.0.1 "$LOCAL_PORT" 2>/dev/null; then
  echo "127.0.0.1:${LOCAL_PORT} già in ascolto (tunnel già attivo?)."
  exit 0
fi

echo "Apro tunnel ${SSH_HOST} → 127.0.0.1:${LOCAL_PORT} (remoto 127.0.0.1:${REMOTE_PORT})…"
exec ssh -N -o ExitOnForwardFailure=yes -L "${LOCAL_PORT}:127.0.0.1:${REMOTE_PORT}" "$SSH_HOST"
