-- Read-only PostgreSQL role for Palio chat tools and MCP sidecar.
-- Apply as superuser, then set CHAT_DATABASE_URL or profile chat_ro in .skills/postgres/config.toml.
-- Example: postgresql://palio_chat_ro:SECRET@host:port/palio

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    CREATE ROLE palio_chat_ro WITH LOGIN PASSWORD 'change_me_before_prod';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE palio TO palio_chat_ro;
GRANT USAGE ON SCHEMA public TO palio_chat_ro;

GRANT SELECT ON TABLE
  contrade,
  palii,
  cavalli,
  fantini,
  capitani,
  mangini,
  barbareschi,
  priori,
  palio_partecipazioni,
  palio_partecipazione_mangini
TO palio_chat_ro;

COMMIT;
