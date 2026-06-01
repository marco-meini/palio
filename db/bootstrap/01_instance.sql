-- Instance bootstrap for PalioDB (run connected to database "postgres" as superuser).
-- Creates application role and database. Does not set app_palio password; run 02 after.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'app_palio') THEN
    CREATE ROLE app_palio WITH
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      INHERIT
      CONNECTION LIMIT 50;
  END IF;
END
$$;
