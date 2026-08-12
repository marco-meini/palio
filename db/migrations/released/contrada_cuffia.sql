-- Cuffia / nonna: periodi in cui una contrada ha la siccità più lunga.
-- Derivato da palio_partecipazioni.vincitrice (non scrapato).
-- Semantica: dopo il risultato del Palio P (vittorie con edizione ≤ P).
-- palio_id_fine NULL = periodo ancora in corso.

BEGIN;

CREATE TABLE IF NOT EXISTS contrada_cuffia (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  contrada_id smallint NOT NULL REFERENCES contrade (id),
  palio_id_inizio bigint NOT NULL REFERENCES palii (id),
  palio_id_fine bigint REFERENCES palii (id),
  CONSTRAINT contrada_cuffia_period_key
    UNIQUE NULLS NOT DISTINCT (contrada_id, palio_id_inizio, palio_id_fine)
);

CREATE INDEX IF NOT EXISTS contrada_cuffia_palio_inizio_idx
  ON contrada_cuffia (palio_id_inizio);
CREATE INDEX IF NOT EXISTS contrada_cuffia_palio_fine_idx
  ON contrada_cuffia (palio_id_fine);
CREATE INDEX IF NOT EXISTS contrada_cuffia_contrada_idx
  ON contrada_cuffia (contrada_id);

CREATE UNIQUE INDEX IF NOT EXISTS contrada_cuffia_one_open_idx
  ON contrada_cuffia ((1))
  WHERE palio_id_fine IS NULL;

COMMENT ON TABLE contrada_cuffia IS
  'Periodi di cuffia/nonna (contrada con siccità più lunga dopo ogni Palio)';
COMMENT ON COLUMN contrada_cuffia.palio_id_inizio IS
  'Primo Palio (incluso) dopo il cui risultato questa contrada è cuffia';
COMMENT ON COLUMN contrada_cuffia.palio_id_fine IS
  'Ultimo Palio (incluso) con questa cuffia; NULL = ancora in corso';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    GRANT SELECT ON TABLE contrada_cuffia TO palio_chat_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_palio') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE contrada_cuffia TO app_palio;
    GRANT USAGE, SELECT ON SEQUENCE contrada_cuffia_id_seq TO app_palio;
  END IF;
END
$$;

COMMIT;
