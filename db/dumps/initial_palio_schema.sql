-- Schema-only initial dump for database "palio" (owner: app_palio).
-- Generated for PalioDB; apply after instance bootstrap.

BEGIN;

CREATE TABLE IF NOT EXISTS contrade (
  id smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT contrade_name_key UNIQUE (name)
);

INSERT INTO contrade (name) VALUES
  ('Aquila'),
  ('Bruco'),
  ('Chiocciola'),
  ('Civetta'),
  ('Drago'),
  ('Giraffa'),
  ('Istrice'),
  ('Leocorno'),
  ('Lupa'),
  ('Nicchio'),
  ('Oca'),
  ('Onda'),
  ('Pantera'),
  ('Selva'),
  ('Tartuca'),
  ('Torre'),
  ('Valdimontone')
ON CONFLICT (name) DO NOTHING;

ALTER TABLE contrade OWNER TO app_palio;
ALTER SEQUENCE contrade_id_seq OWNER TO app_palio;

GRANT USAGE ON SCHEMA public TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_palio;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_palio;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_palio;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO app_palio;

COMMIT;
