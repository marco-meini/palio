-- Rivalità storiche tra contrade (periodi da ilpalio.siena.it ?rivalita).
-- Coppia non orientata: contrada_id < rivale_id.
-- Precisione annuale dal sito: data_inizio = 1 gen, data_fine = 31 dic (NULL = in corso / inizio ignoto).

BEGIN;

CREATE TABLE IF NOT EXISTS contrada_rivalita (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contrada_id smallint NOT NULL REFERENCES contrade (id),
  rivale_id smallint NOT NULL REFERENCES contrade (id),
  data_inizio date,
  data_fine date,
  CONSTRAINT contrada_rivalita_distinct CHECK (contrada_id <> rivale_id),
  CONSTRAINT contrada_rivalita_ordered CHECK (contrada_id < rivale_id),
  CONSTRAINT contrada_rivalita_range CHECK (
    data_inizio IS NULL OR data_fine IS NULL OR data_inizio <= data_fine
  ),
  CONSTRAINT contrada_rivalita_period_key
    UNIQUE NULLS NOT DISTINCT (contrada_id, rivale_id, data_inizio, data_fine)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    GRANT SELECT ON TABLE contrada_rivalita TO palio_chat_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_palio') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contrada_rivalita TO app_palio;
    GRANT USAGE, SELECT ON SEQUENCE contrada_rivalita_id_seq TO app_palio;
  END IF;
END
$$;

COMMIT;
