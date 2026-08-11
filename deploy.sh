#!/usr/bin/env bash
# Deploy completo Dimmelo: build immagini Docker (FE+BE) e avvio stack.
# Uso sul VPS dopo aver configurato .env.production e la rete Docker postgres.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

SKIP_BUILD=false
SKIP_HEALTH=false
VERSION_ARG=""
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:8080/api/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-30}"

usage() {
  cat <<'EOF'
Uso: ./deploy.sh [opzioni]

Deploy completo dell'app Dimmelo (docker compose: backend + frontend).
Le immagini vengono taggate come palio-server:<tag> e palio-client:<tag>.

Opzioni:
  -v, --version <tag>  override del tag immagini (default: campo version in package.json)
  --skip-build         solo docker compose up -d (senza --build), usando il tag
  --skip-health        non attendere /api/health
  -h, --help           mostra questo messaggio

Esempi:
  ./deploy.sh
  ./deploy.sh --version 1.2.0
  ./deploy.sh -v 1.2.0 --skip-build

Prerequisiti:
  - Docker e Docker Compose
  - Rete Docker esterna "postgres" con container DB
  - File .env.production (da .env.production.example; stesse chiavi di .env.example)
  - db/bootstrap/03_pgvector.sql + db/migrations/released/regolamento_chunks.sql
  - cd server && npm run index-regolamento (dopo migration pgvector; richiede Node in dev)
  - Caddy: blocco dimmelo.marcomeini.it → 127.0.0.1:8080 (vedi docker/caddy-dimmelo.snippet)

Variabili ambiente:
  HEALTH_URL      URL health check (default: http://127.0.0.1:8080/api/health)
  HEALTH_RETRIES  tentativi health check (default: 30)
  IMAGE_TAG       alternativa a --version (priorità: --version > IMAGE_TAG > package.json)
EOF
}

log() { printf '==> %s\n' "$*"; }
die() { printf 'ERRORE: %s\n' "$*" >&2; exit 1; }

# m.meini sul VPS: Docker di solito senza sudo; fallback se serve.
DOCKER=(docker)
# IMAGE_TAG passato esplicitamente: con `sudo docker` l'env esportato spesso si perde.
docker_compose() {
  if [[ "${DOCKER[0]}" == "sudo" ]]; then
    sudo env IMAGE_TAG="$IMAGE_TAG" docker compose "$@"
  else
    env IMAGE_TAG="$IMAGE_TAG" docker compose "$@"
  fi
}

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
    -v|--version)
      [[ $# -ge 2 ]] || die "--version richiede un valore (es. --version 1.2.0)"
      VERSION_ARG="$2"
      shift 2
      ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --skip-health) SKIP_HEALTH=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) die "Argomento sconosciuto: $1 (usa --help)" ;;
  esac
done

package_version() {
  local pkg="$ROOT/package.json"
  [[ -f "$pkg" ]] || die "Manca package.json nella root del repo"
  local ver=""
  if command -v node >/dev/null 2>&1; then
    ver="$(node -p "require('./package.json').version" 2>/dev/null || true)"
  fi
  if [[ -z "$ver" ]]; then
    ver="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' "$pkg" | head -n1)"
  fi
  [[ -n "$ver" ]] || die "Impossibile leggere version da package.json"
  printf '%s' "$ver"
}

resolve_image_tag() {
  # Priorità: --version > IMAGE_TAG env > package.json "version"
  ENV_IMAGE_TAG="${IMAGE_TAG:-}"
  if [[ -n "$VERSION_ARG" ]]; then
    IMAGE_TAG="$VERSION_ARG"
    TAG_SOURCE="--version"
  elif [[ -n "$ENV_IMAGE_TAG" ]]; then
    IMAGE_TAG="$ENV_IMAGE_TAG"
    TAG_SOURCE="env IMAGE_TAG"
  else
    IMAGE_TAG="$(package_version)"
    TAG_SOURCE="package.json"
  fi
  if [[ ! "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
    die "Tag non valido: '${IMAGE_TAG}' (usa solo lettere, numeri, . _ -)"
  fi
  export IMAGE_TAG
  # Compose legge .env per interpolare ${IMAGE_TAG} (affidabile anche con sudo).
  {
    [[ -f "$ROOT/.env" ]] && grep -vE '^IMAGE_TAG=' "$ROOT/.env" || true
    printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG"
  } >"$ROOT/.env.tmp"
  mv "$ROOT/.env.tmp" "$ROOT/.env"
}

log "Verifica prerequisiti…"

command -v docker >/dev/null 2>&1 || die "docker non trovato"
init_docker
# compose version check without IMAGE_TAG yet
if [[ "${DOCKER[0]}" == "sudo" ]]; then
  sudo docker compose version >/dev/null 2>&1 || die "docker compose non trovato"
else
  docker compose version >/dev/null 2>&1 || die "docker compose non trovato"
fi

[[ -f docker-compose.yml ]] || die "docker-compose.yml non trovato (esegui dalla root del repo)"
[[ -f .env.production ]] || die "Manca .env.production — copia da .env.production.example e compila i valori"

require_env DATABASE_URL
require_env ANTHROPIC_API_KEY

if [[ -z "$(env_value CHAT_DATABASE_URL)" ]]; then
  log "Nota: CHAT_DATABASE_URL non impostato — il chat userà DATABASE_URL (consigliato palio_chat_ro in prod)"
fi

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

if [[ "${DOCKER[0]}" == "sudo" ]]; then
  sudo docker network inspect postgres >/dev/null 2>&1 \
    || die "Rete Docker 'postgres' non trovata — creala e collega il container Postgres"
else
  docker network inspect postgres >/dev/null 2>&1 \
    || die "Rete Docker 'postgres' non trovata — creala e collega il container Postgres"
fi

log "Regolamento RAG: assicurati che pgvector sia abilitato e l'indice popolato:"
log "  psql ... -f db/bootstrap/03_pgvector.sql"
log "  psql ... -f db/migrations/released/regolamento_chunks.sql"
log "  cd server && npm run index-regolamento"

command -v git >/dev/null 2>&1 || die "git non trovato"
[[ -d .git ]] || die "Non è un repository git"
log "git pull…"
git pull --ff-only

# Dopo git pull: version da package.json aggiornato
resolve_image_tag
log "IMAGE_TAG=${IMAGE_TAG} (da ${TAG_SOURCE})"

if $SKIP_BUILD; then
  log "Avvio container (senza rebuild) — immagini :${IMAGE_TAG}…"
  docker_compose up -d
else
  log "Build immagini :${IMAGE_TAG} e avvio container…"
  docker_compose up -d --build
fi

reload_caddy

log "Stato container:"
docker_compose ps

if ! $SKIP_HEALTH; then
  log "Attendo health check (${HEALTH_URL}, max ${HEALTH_RETRIES} tentativi)…"
  ok=false
  for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/tmp/palio-health.json 2>/dev/null; then
      ok=true
      break
    fi
    if (( i == 1 || i % 5 == 0 )); then
      log "  tentativo ${i}/${HEALTH_RETRIES}…"
    fi
    sleep 2
  done
  if ! $ok; then
    log "Ultimi log backend:"
    docker_compose logs --tail=40 server || true
    die "Health check fallito dopo ${HEALTH_RETRIES} tentativi. Diagnostica: docker compose ps && docker compose logs --tail=80 server"
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
