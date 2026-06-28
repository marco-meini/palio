-- Enable pgvector on the Postgres instance (run as superuser on database "palio").
-- Requires the pgvector OS package (e.g. postgresql-18-pgvector on Debian/PGDG).
-- See docker/install-pgvector.md if CREATE EXTENSION fails with "not available".

CREATE EXTENSION IF NOT EXISTS vector;
