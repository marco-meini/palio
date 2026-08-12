-- Giro di caduta da /cadute (ilpalio.siena.it).
-- NULL = nessuna caduta; 1/2/3 = Primo/Secondo/Terzo giro.

BEGIN;

ALTER TABLE palio_partecipazioni
  ADD COLUMN IF NOT EXISTS giro_caduta smallint;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'palio_partecipazioni_giro_caduta_check'
  ) THEN
    ALTER TABLE palio_partecipazioni
      ADD CONSTRAINT palio_partecipazioni_giro_caduta_check
      CHECK (giro_caduta IS NULL OR giro_caduta BETWEEN 1 AND 3);
  END IF;
END
$$;

COMMENT ON COLUMN palio_partecipazioni.giro_caduta IS
  'Giro di caduta (1–3) da /cadute; NULL se non caduta';

COMMIT;
