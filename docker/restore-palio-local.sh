#!/bin/sh
# Ripristina il dump palio in un container Postgres locale (default: postgres)
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DUMP="${1:-$HOME/Downloads/palio-20260604-164751.dump}"
CONTAINER="${CONTAINER:-postgres}"
PGPORT="${PGPORT:-5432}"

if [ ! -f "$DUMP" ]; then
  echo "Dump non trovato: $DUMP" >&2
  echo "Uso: CONTAINER=postgres $0 [/path/to/palio.dump]" >&2
  exit 1
fi

if ! docker inspect "$CONTAINER" >/dev/null 2>&1; then
  echo "Container '$CONTAINER' non trovato. Avvialo da Portainer/Docker Desktop." >&2
  exit 1
fi

echo "Container: $CONTAINER"
echo "Attendo Postgres..."
until docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1; do sleep 1; done

docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_palio') THEN CREATE ROLE app_palio WITH LOGIN PASSWORD 'test'; END IF; END \$\$;"

docker cp "$DUMP" "$CONTAINER:/tmp/palio.restore.dump"

echo "pg_restore in corso..."
docker exec "$CONTAINER" pg_restore -U postgres -d postgres --clean --if-exists --no-owner --no-acl -C /tmp/palio.restore.dump 2>/dev/null || \
docker exec "$CONTAINER" pg_restore -U postgres -d postgres --clean --if-exists --no-owner -C /tmp/palio.restore.dump || true

docker exec "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -c \
  "GRANT ALL ON DATABASE palio TO app_palio; GRANT ALL ON SCHEMA public TO app_palio;" 2>/dev/null || true
docker exec "$CONTAINER" psql -U postgres -d palio -v ON_ERROR_STOP=1 -c \
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_palio;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_palio;" 2>/dev/null || true

docker exec "$CONTAINER" rm -f /tmp/palio.restore.dump

echo ""
echo "OK. Verifica:"
docker exec "$CONTAINER" psql -U postgres -d palio -c '\dt'
docker exec "$CONTAINER" psql -U postgres -d palio -c 'SELECT count(*) AS palii FROM palii;'

echo ""
echo "Connessione: postgres://postgres:<password>@127.0.0.1:${PGPORT}/palio"
echo "(password = POSTGRES_PASSWORD del container)"
