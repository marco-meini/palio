-- Passa ad app_palio la proprietà degli oggetti dello schema public (run as superuser on
-- database "palio"). Una tantum, prima del primo scripts/release.sh: le migrazioni girano con
-- il ruolo app_palio (PG_APP_ROLE) e possono modificare (ALTER) solo oggetti suoi.
-- Idempotente: tocca solo ciò che non è già di app_palio. Esclude gli oggetti delle estensioni
-- (es. pgvector), che restano del superuser. I GRANT esistenti (es. palio_chat_ro) restano.

BEGIN;

-- Da Postgres 15 lo schema public non concede più CREATE a tutti: le migrazioni come app_palio
-- devono poter creare tabelle (anche CREATE TABLE IF NOT EXISTS controlla prima il permesso).
GRANT USAGE, CREATE ON SCHEMA public TO app_palio;

DO $$
DECLARE
  obj record;
BEGIN
  -- Tabelle, viste, viste materializzate, tabelle esterne/partizionate.
  -- ALTER TABLE ... OWNER sposta anche le sequenze identity/serial legate alle colonne.
  FOR obj IN
    SELECT c.oid, c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relowner <> 'app_palio'::regrole
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER %s public.%I OWNER TO app_palio',
      CASE obj.relkind
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      obj.relname);
    RAISE NOTICE 'owner app_palio: %', obj.relname;
  END LOOP;

  -- Sequenze rimaste (non legate a una colonna).
  FOR obj IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'S'
      AND c.relowner <> 'app_palio'::regrole
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass AND d.objid = c.oid AND d.deptype IN ('e', 'a', 'i'))
  LOOP
    EXECUTE format('ALTER SEQUENCE public.%I OWNER TO app_palio', obj.relname);
    RAISE NOTICE 'owner app_palio: %', obj.relname;
  END LOOP;

  -- Funzioni e procedure.
  FOR obj IN
    SELECT p.oid
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proowner <> 'app_palio'::regrole
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('ALTER ROUTINE %s OWNER TO app_palio', obj.oid::regprocedure);
    RAISE NOTICE 'owner app_palio: %', obj.oid::regprocedure;
  END LOOP;
END
$$;

COMMIT;

-- Verifica: deve restituire solo app_palio (più eventuali oggetti di estensioni).
SELECT tableowner, count(*) AS tabelle
FROM pg_tables
WHERE schemaname = 'public'
GROUP BY tableowner;
