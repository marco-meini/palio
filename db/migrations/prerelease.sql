-- Pending migration: palii, anagrafiche, partecipazioni (apply via postgres CLI, then migration release).

BEGIN;

CREATE TABLE IF NOT EXISTS palii (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_code text NOT NULL,
  data_palio date NOT NULL,
  straordinario boolean NOT NULL DEFAULT false,
  CONSTRAINT palii_source_code_key UNIQUE (source_code)
);

CREATE TABLE IF NOT EXISTS cavalli (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL,
  nome text NOT NULL,
  CONSTRAINT cavalli_source_id_key UNIQUE (source_id)
);

CREATE TABLE IF NOT EXISTS fantini (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  source_id text NOT NULL,
  nome text NOT NULL,
  soprannome text,
  CONSTRAINT fantini_source_id_key UNIQUE (source_id)
);

CREATE TABLE IF NOT EXISTS capitani (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  CONSTRAINT capitani_nome_key UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS mangini (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  CONSTRAINT mangini_nome_key UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS barbareschi (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  CONSTRAINT barbareschi_nome_key UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS priori (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  nome text NOT NULL,
  CONSTRAINT priori_nome_key UNIQUE (nome)
);

CREATE TABLE IF NOT EXISTS palio_partecipazioni (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  palio_id bigint NOT NULL REFERENCES palii (id) ON DELETE CASCADE,
  contrada_id smallint NOT NULL REFERENCES contrade (id),
  vincitrice boolean NOT NULL DEFAULT false,
  non_partecipa boolean NOT NULL DEFAULT false,
  canape smallint,
  cavallo_id bigint REFERENCES cavalli (id),
  fantino_id bigint REFERENCES fantini (id),
  capitano_id bigint REFERENCES capitani (id),
  priore_id bigint REFERENCES priori (id),
  barbaresco_id bigint REFERENCES barbareschi (id),
  CONSTRAINT palio_partecipazioni_palio_contrada_key UNIQUE (palio_id, contrada_id)
);

CREATE TABLE IF NOT EXISTS palio_partecipazione_mangini (
  partecipazione_id bigint NOT NULL REFERENCES palio_partecipazioni (id) ON DELETE CASCADE,
  mangini_id bigint NOT NULL REFERENCES mangini (id),
  ordine smallint,
  PRIMARY KEY (partecipazione_id, mangini_id)
);

ALTER TABLE palii OWNER TO app_palio;
ALTER TABLE cavalli OWNER TO app_palio;
ALTER TABLE fantini OWNER TO app_palio;
ALTER TABLE capitani OWNER TO app_palio;
ALTER TABLE mangini OWNER TO app_palio;
ALTER TABLE barbareschi OWNER TO app_palio;
ALTER TABLE priori OWNER TO app_palio;
ALTER TABLE palio_partecipazioni OWNER TO app_palio;
ALTER TABLE palio_partecipazione_mangini OWNER TO app_palio;

ALTER SEQUENCE palii_id_seq OWNER TO app_palio;
ALTER SEQUENCE cavalli_id_seq OWNER TO app_palio;
ALTER SEQUENCE fantini_id_seq OWNER TO app_palio;
ALTER SEQUENCE capitani_id_seq OWNER TO app_palio;
ALTER SEQUENCE mangini_id_seq OWNER TO app_palio;
ALTER SEQUENCE barbareschi_id_seq OWNER TO app_palio;
ALTER SEQUENCE priori_id_seq OWNER TO app_palio;
ALTER SEQUENCE palio_partecipazioni_id_seq OWNER TO app_palio;

GRANT SELECT, INSERT, UPDATE, DELETE ON palii TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON cavalli TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON fantini TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON capitani TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON mangini TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON barbareschi TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON priori TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON palio_partecipazioni TO app_palio;
GRANT SELECT, INSERT, UPDATE, DELETE ON palio_partecipazione_mangini TO app_palio;

GRANT USAGE, SELECT ON SEQUENCE palii_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE cavalli_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE fantini_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE capitani_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE mangini_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE barbareschi_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE priori_id_seq TO app_palio;
GRANT USAGE, SELECT ON SEQUENCE palio_partecipazioni_id_seq TO app_palio;

-- Rename legacy column if migration was applied before canape rename.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'ordine'
  ) THEN
    ALTER TABLE palio_partecipazioni RENAME COLUMN ordine TO canape;
  END IF;
END
$$;

COMMENT ON COLUMN palio_partecipazioni.canape IS 'Posto ingresso canape: 1-9; 10 = rincorsa (R)';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'non_partecipa'
  ) THEN
    ALTER TABLE palio_partecipazioni
      ADD COLUMN non_partecipa boolean NOT NULL DEFAULT false;
  END IF;
END
$$;

COMMENT ON COLUMN palio_partecipazioni.non_partecipa IS 'Contrada estratta ma non corre (N.P. sul sito): senza canape/cavallo/fantino';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'ordine'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN ordine smallint;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'estratta'
  ) THEN
    ALTER TABLE palio_partecipazioni
      ADD COLUMN estratta boolean NOT NULL DEFAULT false;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'estratta_da_id'
  ) THEN
    ALTER TABLE palio_partecipazioni
      ADD COLUMN estratta_da_id smallint REFERENCES contrade (id);
  END IF;
END
$$;

COMMENT ON COLUMN palio_partecipazioni.ordine IS 'Ordine di estrazione sul sito (1-10); distinto da canape';
COMMENT ON COLUMN palio_partecipazioni.estratta IS 'true se il sito mostra «estratta da …» (anche Sindaco; senza FK su estratta_da_id)';
COMMENT ON COLUMN palio_partecipazioni.estratta_da_id IS 'Contrada che ha estratto questa; NULL se assente o «estratta da Sindaco»';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'ordine_assegnazione'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN ordine_assegnazione smallint;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'orecchio'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN orecchio smallint;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'coscia'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN coscia smallint;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'proprietario_cavallo'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN proprietario_cavallo text;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'cavallo_preso_da'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN cavallo_preso_da text;
  END IF;
END
$$;

COMMENT ON COLUMN palio_partecipazioni.ordine_assegnazione IS 'Ordine assegnazione cavalli in tratta (1-10, da /assegnazione-cavalli)';
COMMENT ON COLUMN palio_partecipazioni.orecchio IS 'Numero orecchio cavallo (da .NumeriCavallo.Orecchio)';
COMMENT ON COLUMN palio_partecipazioni.coscia IS 'Numero coscia cavallo (da .NumeriCavallo.Coscia)';
COMMENT ON COLUMN palio_partecipazioni.proprietario_cavallo IS 'Proprietario del cavallo in tratta';
COMMENT ON COLUMN palio_partecipazioni.cavallo_preso_da IS 'Persona che ha «preso» il cavallo per la contrada';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'palio_partecipazioni'
      AND column_name = 'ordine_arrivo'
  ) THEN
    ALTER TABLE palio_partecipazioni ADD COLUMN ordine_arrivo smallint;
  END IF;
END
$$;

COMMENT ON COLUMN palio_partecipazioni.ordine_arrivo IS 'Posizione in arrivo (1, 2, 3…; da /ordine-arrivo; NULL se non elencata)';

COMMIT;
