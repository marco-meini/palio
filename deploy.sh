#!/usr/bin/env bash
# Deploy completo Dimmelo: build immagini Docker (FE+BE) e avvio stack.
# Uso sul VPS dopo aver configurato .env.production e la rete Docker postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SKIP_BUILD=false
SKIP_HEALTH=false
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

usage() {
  cat <<'EOF'
Uso: ./deploy.sh [opzioni]

Deploy completo dell'app Dimmelo (docker compose: backend + frontend).

Opzioni:
  --skip-build   solo docker compose up -d (senza --build)
  --skip-health  non attendere /api/health
  -h, --help     mostra questo messaggio

Prerequisiti:
  - Docker e Docker Compose
  - Rete Docker esterna "postgres" con container DB
  - File .env.production (da .env.production.example)
  - be/data/regolamento-index.json (cd be && npm run index-regolamento)
  - Caddy: blocco dimmelo.marcomeini.it → 127.0.0.1:8080 (vedi docker/caddy-dimmelo.snippet)

Variabili ambiente:
  HEALTH_URL      URL health check (default: http://127.0.0.1:8080/api/health)
  HEALTH_RETRIES  tentativi health check (default: 30)
EOF
}

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERRORE: %s\n' "$*" >&2; exit 1; }

# m.meini sul VPS: Docker di solito senza sudo; fallback se serve.
DOCKER=(docker)
docker_compose() { "${DOCKER[@]}" compose "$@"; }

init_docker() {
  if docker info >/dev/null 2>&1; then
    DOCKER=(docker)
    return 0
  fi
  if sudo docker info >/dev/null 2>&1; then
    DOCKER=(sudo docker)
    log "Docker via sudo"
    return 0
  fi
  die "Docker non accessibile (prova: sudo usermod -aG docker m.meini, poi nuova sessione SSH)"
}

reload_caddy() {
  if ! command -v systemctl >/dev/null 2>&1; then
    log "systemctl non disponibile — salto reload Caddy"
    return 0
  fi
  if ! sudo systemctl is-active --quiet caddy 2>/dev/null; then
    log "Servizio caddy non attivo — salto reload"
    return 0
  fi
  log "Ricarico Caddy (sudo)…"
  sudo systemctl reload caddy
}

env_value() {
  local key="$1"
  local file="$ROOT/.env.production"
  grep -E "^${key}=" "$file" 2>/dev/null | head -n1 | cut -d= -f2- || true
}

require_env() {
  local key="$1"
  local optional="${2:-false}"
  local val
  val="$(env_value "$key")"
  if [[ -z "$val" ]]; then
    if [[ "$optional" == "true" ]]; then
      return 0
    fi
    die "Manca ${key} in .env.production"
  fi
  if [[ "$val" == "CHANGE_ME" || "$val" == "changeme" ]]; then
    die "${key} non configurato in .env.production (valore placeholder)"
  fi
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-health) SKIP_HEALTH=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Argomento sconosciuto: $1 (usa --help)" ;;
  esac
done

log "Verifica prerequisiti…"

command -v docker >/dev/null 2>&1 || die "docker non trovato"
init_docker
docker_compose version >/dev/null 2>&1 || die "docker compose non trovato"

[[ -f docker-compose.yml ]] || die "docker-compose.yml non trovato (esegui dalla root del repo)"
[[ -f .env.production ]] || die "Manca .env.production — copia da .env.production.example e compila i valori"

require_env DATABASE_URL
require_env ANTHROPIC_API_KEY

auth_enabled="$(printf '%s' "$(env_value AUTH_ENABLED)" | tr '[:upper:]' '[:lower:]')"
if [[ "$auth_enabled" == "true" ]]; then
  require_env AUTH_SESSION_SECRET
  if [[ -z "$(env_value GOOGLE_CLIENT_ID)" && -z "$(env_value GOOGLE_OAUTH_JSON_PATH)" ]]; then
    die "AUTH_ENABLED=true ma mancano GOOGLE_CLIENT_ID o GOOGLE_OAUTH_JSON_PATH in .env.production"
  fi
  if [[ -n "$(env_value GOOGLE_CLIENT_ID)" ]]; then
    require_env GOOGLE_CLIENT_SECRET
  fi
fi

"${DOCKER[@]}" network inspect postgres >/dev/null 2>&1 \
  || die "Rete Docker 'postgres' non trovata — creala e collega il container Postgres"

[[ -f be/data/regolamento-index.json ]] \
  || die "Manca be/data/regolamento-index.json — genera con: cd be && npm run index-regolamento"

command -v git >/dev/null 2>&1 || die "git non trovato"
[[ -d .git ]] || die "Non è un repository git"
log "git pull…"
git pull --ff-only

if $SKIP_BUILD; then
  log "Avvio container (senza rebuild)…"
  docker_compose up -d
else
  log "Build immagini e avvio container…"
  docker_compose up -d --build
fi

reload_caddy

log "Stato container:"
docker_compose ps

if ! $SKIP_HEALTH; then
  log "Attendo health check (${HEALTH_URL})…"
  ok=false
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if curl -fsS "$HEALTH_URL" >/tmp/palio-health.json 2>/dev/null; then
      ok=true
      break
    fi
    sleep 2
  done
  if ! $ok; then
    die "Health check fallito dopo ${HEALTH_RETRIES} tentativi. Log BE: ${DOCKER[*]} compose logs --tail=80 be"
  fi
  log "Health OK: $(cat /tmp/palio-health.json)"
  rm -f /tmp/palio-health.json
fi

cat <<'EOF'

Deploy completato.

Se è il primo deploy:
  - Caddy: aggiungi il blocco dimmelo.marcomeini.it in /etc/caddy/Caddyfile
    (vedi docker/caddy-dimmelo.snippet), poi rilancia ./deploy.sh

Verifica pubblica:
  curl -s https://dimmelo.marcomeini.it/api/health

EOF
