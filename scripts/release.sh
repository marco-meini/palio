#!/usr/bin/env bash
# Rilascio di Palio / Dimmelo in produzione. Si lancia a mano SUL SERVER, dalla copia del repo, entrando
# con l'inoltro dell'ssh-agent: sul server non c'è nessuna chiave per GitHub, git pull e
# git push usano quella del Mac solo per la durata della sessione.
#
#   ssh -A m.meini@<server>        (oppure ForwardAgent yes per quell'host in ~/.ssh/config)
#   cd ~/palio && scripts/release.sh [--dry-run] [--yes] [--skip-migrations] [--skip-deploy] [--build]
#
# 1. Aggiorna il codice (git pull) dal repository. Rilascia la versione di package.json, che
#    deve avere il suo tag vX.Y.Z: dopo il tag non ci devono essere modifiche al codice né
#    migrazioni nuove. Controlla che la CI abbia pubblicato su GHCR le immagini :X.Y.Z (ci
#    sono solo se typecheck, test e build sono passati).
# 2. Migrazioni: esegue, in ordine di nome, gli script db/migrations/NNNN_*.sql non ancora
#    spostati in db/migrations/released/; ognuno che va a buon fine viene spostato (git mv).
#    Al primo errore si ferma: quello che fallisce resta dov'è e il codice non si rilascia.
#    Gli spostamenti finiscono in un commit, inviato al repository (git push).
# 3. Codice: scarica le immagini della CI (con --build, o senza IMAGE_PREFIX, le costruisce
#    sul server), riavvia i container (docker compose) e controlla l'health check.
#
# Configurazione in scripts/release.conf (da scripts/release.conf.example); il .env.production
# sta nella root del repo.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MIGRATIONS_DIR=db/migrations
RELEASED_DIR=db/migrations/released
CONF=scripts/release.conf

DRY_RUN=false
ASSUME_YES=false
SKIP_MIGRATIONS=false
SKIP_DEPLOY=false
BUILD=false

usage() { sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; }
log() { printf '\n==> %s\n' "$*"; }
die() { printf '\nERRORE: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true ;;
    -y | --yes) ASSUME_YES=true ;;
    --skip-migrations) SKIP_MIGRATIONS=true ;;
    --skip-deploy) SKIP_DEPLOY=true ;;
    --build) BUILD=true ;;
    -h | --help) usage; exit 0 ;;
    *) die "Argomento sconosciuto: $1 (usa --help)" ;;
  esac
  shift
done

# --- configurazione -----------------------------------------------------------

[[ -f "$CONF" ]] || die "Manca $CONF: copialo da $CONF.example e compilalo"
# shellcheck source=/dev/null
source "$CONF"
for key in PG_CONTAINER PG_SUPERUSER PG_DATABASE PG_APP_ROLE HEALTH_URL; do
  [[ -n "${!key:-}" ]] || die "Manca $key in $CONF"
done

# psql nel container: superuser, ma con il ruolo applicativo (gli oggetti creati sono suoi).
psql_app() {
  docker exec -i -e "PGOPTIONS=-c role=$PG_APP_ROLE" "$PG_CONTAINER" \
    psql -X -q -U "$PG_SUPERUSER" -d "$PG_DATABASE" -v ON_ERROR_STOP=1 "$@"
}

# --- controlli e aggiornamento del codice --------------------------------------

log "Controlli"
command -v git >/dev/null || die "git non trovato"
docker compose version >/dev/null 2>&1 || die "docker compose non disponibile (l'utente è nel gruppo docker?)"
[[ -f .env.production ]] || die "Manca .env.production nella root del repo (configurazione di produzione)"
[[ -d "$RELEASED_DIR" ]] || die "Manca la cartella $RELEASED_DIR"
git diff --quiet HEAD -- || die "Ci sono modifiche locali non committate: il server deve restare uguale al repository"
[[ -n "$(git config user.email)" ]] || die "Imposta l'autore dei commit: git config user.name/user.email"
# Accesso a GitHub (serve anche per il push finale): di norma con l'agent inoltrato da ssh -A.
git ls-remote --exit-code origin HEAD >/dev/null 2>&1 \
  || die "GitHub non raggiungibile (git ls-remote origin): rientra con ssh -A e controlla che origin sia git@github.com:…"

role_ok="$(psql_app -tAc "SELECT current_user = '$PG_APP_ROLE'" </dev/null)" \
  || die "Connessione a $PG_DATABASE nel container $PG_CONTAINER non riuscita"
[[ "$role_ok" == "t" ]] || die "Le migrazioni non girerebbero come $PG_APP_ROLE"

if $DRY_RUN; then
  git fetch --quiet --tags
  echo "Commit locale $(git rev-parse --short HEAD), sul repository $(git rev-parse --short '@{u}')"
  echo "(--dry-run: niente git pull, il piano vale per il codice già presente)"
else
  log "Aggiornamento del codice"
  git pull --rebase
  git fetch --quiet --tags
fi

COMMIT="$(git rev-parse --short HEAD)"
VERSION="$(sed -nE 's/^[[:space:]]*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/p' package.json | head -n1)"
[[ -n "$VERSION" ]] || die "Versione non trovata in package.json"
# Le immagini della CI hanno come tag la versione (.github/workflows/ci.yml).
TAG="$VERSION"

# Il codice da rilasciare è quello del tag vX.Y.Z: dopo, solo commit di rilascio
# (migrazioni spostate in released/).
GIT_TAG="v$VERSION"
git rev-parse -q --verify "refs/tags/$GIT_TAG" >/dev/null \
  || die "Manca il tag $GIT_TAG: in locale crea la versione (npm version patch|minor) e git push --follow-tags"
git merge-base --is-ancestor "$GIT_TAG" HEAD || die "Il tag $GIT_TAG non è nella storia di $(git branch --show-current)"
git diff --quiet "$GIT_TAG" HEAD -- . ':(exclude)db/migrations' \
  || die "Ci sono modifiche al codice dopo $GIT_TAG: crea una nuova versione per rilasciarle"
[[ -z "$(git diff --name-only --diff-filter=A "$GIT_TAG" HEAD -- db/migrations ':(exclude)db/migrations/released')" ]] \
  || die "Ci sono migrazioni nuove dopo $GIT_TAG: crea una nuova versione per rilasciarle"

# Immagini: dalla CI (GHCR) se c'è IMAGE_PREFIX, altrimenti costruite qui.
IMAGE_PREFIX="${IMAGE_PREFIX:-}"
[[ -z "$IMAGE_PREFIX" ]] && BUILD=true
export PALIO_TAG="$TAG"
if $BUILD; then export PALIO_IMAGE_PREFIX=""; else export PALIO_IMAGE_PREFIX="$IMAGE_PREFIX"; fi
IMAGES=("${PALIO_IMAGE_PREFIX}palio-server:$TAG" "${PALIO_IMAGE_PREFIX}palio-client:$TAG")

# Prima di toccare il database: le immagini di questo commit devono esistere.
if ! $SKIP_DEPLOY && ! $BUILD; then
  for image in "${IMAGES[@]}"; do
    docker manifest inspect "$image" >/dev/null 2>&1 || die "Immagine $image non trovata.
  La CI del tag $GIT_TAG è ancora in corso o è fallita (vedi Actions su GitHub),
  oppure manca il login al registry (docker login ghcr.io).
  Per costruire le immagini sul server: --build"
  done
fi

# Migrazioni da eseguire: NNNN_*.sql non ancora in released/, in ordine di nome.
PENDING=()
if ! $SKIP_MIGRATIONS; then
  for file in "$MIGRATIONS_DIR"/[0-9][0-9][0-9][0-9]_*.sql; do
    [[ -e "$file" ]] || continue
    name="$(basename "$file")"
    [[ -e "$RELEASED_DIR/$name" ]] && die "$name è sia in $MIGRATIONS_DIR sia in $RELEASED_DIR"
    PENDING+=("$file")
  done
fi

# --- piano --------------------------------------------------------------------

log "Piano"
echo "Versione: $VERSION (tag $GIT_TAG, commit $COMMIT)"
if $SKIP_MIGRATIONS; then
  echo "Migrazioni: saltate"
elif [[ ${#PENDING[@]} -eq 0 ]]; then
  echo "Migrazioni: nessuna da eseguire"
else
  echo "Migrazioni su $PG_DATABASE (come $PG_APP_ROLE):"
  for file in "${PENDING[@]}"; do echo "  - $(basename "$file")"; done
fi
if $SKIP_DEPLOY; then
  echo "Container: non aggiornati"
elif $BUILD; then
  echo "Container: palio-server/palio-client :$TAG (build sul server)"
else
  echo "Container: ${IMAGES[*]} (dalla CI)"
fi

$DRY_RUN && { echo; echo "Prova (--dry-run): nessuna modifica."; exit 0; }
if ! $ASSUME_YES; then
  printf '\nProcedo? [s/N] '
  read -r answer
  [[ "$answer" == [sSyY]* ]] || die "Annullato"
fi

# --- migrazioni ---------------------------------------------------------------

# Registra (commit + push) le migrazioni già spostate, anche se una successiva fallisce.
record_released() {
  local count="$1"
  [[ "$count" -gt 0 ]] || return 0
  git commit -q -m "Rilascio $TAG: migrazioni eseguite" -- "$MIGRATIONS_DIR"
  if git push -q; then
    echo "Spostamenti in $RELEASED_DIR registrati e inviati al repository."
  else
    echo "ATTENZIONE: commit creato ma git push non riuscito: invialo a mano (git push)." >&2
  fi
}

if [[ ${#PENDING[@]} -gt 0 ]]; then
  log "Migrazioni"
  done_count=0
  for file in "${PENDING[@]}"; do
    name="$(basename "$file")"
    echo "-- $name"
    if ! psql_app <"$file"; then
      record_released "$done_count"
      die "$name non è andata a buon fine: è rimasta in $MIGRATIONS_DIR, i container non sono stati aggiornati"
    fi
    git mv "$file" "$RELEASED_DIR/$name"
    done_count=$((done_count + 1))
  done
  record_released "$done_count"
fi

# --- container ----------------------------------------------------------------

if ! $SKIP_DEPLOY; then
  if $BUILD; then
    log "Build delle immagini (:$TAG)"
    docker compose build
  else
    log "Download delle immagini (:$TAG)"
    for image in "${IMAGES[@]}"; do docker pull -q "$image"; done
  fi
  log "Avvio dei container"
  docker compose up -d --wait --remove-orphans --no-build
  docker compose ps

  log "Health check ($HEALTH_URL)"
  ok=false
  for _ in $(seq 1 15); do
    if curl -fsS --max-time 5 "$HEALTH_URL" >/dev/null 2>&1; then ok=true; break; fi
    sleep 2
  done
  $ok || die "Health check fallito. Log: docker compose logs --tail=80 server"
  echo "OK"
fi

log "Rilascio completato"
