-- Prove del Palio (ingresso al canape per prova: canape + fantino; senza cavallo).
-- Fonte: /5/Palio/{code}/prove — sei prove (1–4, Generale, Provaccia).
-- Una riga per (palio, numero prova, contrada). Etichetta derivabile da numero.

BEGIN;

CREATE TABLE IF NOT EXISTS palio_prove (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  palio_id bigint NOT NULL REFERENCES palii (id) ON DELETE CASCADE,
  numero smallint NOT NULL,
  contrada_id smallint NOT NULL REFERENCES contrade (id),
  canape smallint,
  fantino_id bigint REFERENCES fantini (id),
  non_partecipa boolean NOT NULL DEFAULT false,
  CONSTRAINT palio_prove_numero_check CHECK (numero BETWEEN 1 AND 6),
  CONSTRAINT palio_prove_canape_check
    CHECK (canape IS NULL OR canape BETWEEN 1 AND 10),
  CONSTRAINT palio_prove_palio_numero_contrada_key UNIQUE (palio_id, numero, contrada_id)
);

COMMENT ON TABLE palio_prove IS 'Canape e fantino per contrada in una prova (1–6); cavallo = palio_partecipazioni';
COMMENT ON COLUMN palio_prove.numero IS '1–4 Prima…Quarta, 5 Prova Generale, 6 Provaccia';
COMMENT ON COLUMN palio_prove.canape IS 'Posto canape prova: 1–9; 10 = rincorsa (R); NULL se non_partecipa';
COMMENT ON COLUMN palio_prove.fantino_id IS 'Fantino in prova (può differire dal Palio); NULL se N.P. o DF(-1)';

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    GRANT SELECT ON TABLE palio_prove TO palio_chat_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_palio') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE palio_prove TO app_palio;
    GRANT USAGE, SELECT ON SEQUENCE palio_prove_id_seq TO app_palio;
  END IF;
END
$$;

COMMIT;
