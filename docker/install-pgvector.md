# Installare pgvector sul Postgres di Palio

L'errore `extension "vector" is not available` significa che **PostgreSQL è installato ma manca il pacchetto pgvector** sul sistema (non basta `CREATE EXTENSION`).

Verifica versione (da host con accesso al DB):

```bash
psql -h HOST -p PORT -U postgres -d palio -c "SELECT split_part(version(), ' ', 2) AS pg_version;"
```

Su Palio/Dimmelo il server è tipicamente **PostgreSQL 18** in container Docker Debian.

## Opzione A — Container Docker esistente (consigliata se il DB è già in Docker)

Sul VPS, con container `postgres` (nome usato in [`restore-palio-local.sh`](restore-palio-local.sh)):

```bash
# 1. Installa il pacchetto pgvector nel container (PG 18)
docker exec -u root postgres bash -c '
  apt-get update &&
  apt-get install -y postgresql-18-pgvector
'

# 2. Riavvia Postgres
docker restart postgres

# 3. Abilita l'estensione sul database palio
docker exec -i postgres psql -U postgres -d palio -v ON_ERROR_STOP=1 \
  -f - < db/bootstrap/03_pgvector.sql

# 4. Crea la tabella chunk
docker exec -i postgres psql -U postgres -d palio -v ON_ERROR_STOP=1 \
  -f - < db/migrations/released/regolamento_chunks.sql

# 5. Indicizza il PDF (da macchina con repo + poppler, punta al DB remoto)
cd server && DATABASE_URL='postgresql://postgres:PASSWORD@HOST:PORT/palio' npm run index-regolamento
```

Se `apt-get install postgresql-18-pgvector` fallisce, il container potrebbe non avere il repo PGDG: usa l'**opzione B**.

## Opzione B — Immagine Docker con pgvector preinstallato

Per nuovi deploy o migrazione del volume dati:

```bash
# Esempio: sostituire l'immagine con pgvector/pgvector:pg18
# (backup del volume dati prima di cambiare immagine)
docker pull pgvector/pgvector:pg18
```

Poi ricrea il container collegato alla rete `postgres` e al volume esistente. Dopo il restore:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Documentazione: https://github.com/pgvector/pgvector#docker

## Verifica

```sql
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
SELECT count(*) FROM regolamento_chunks;
```
