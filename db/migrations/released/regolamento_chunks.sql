-- Regolamento RAG chunks (pgvector). Requires extension vector (see db/bootstrap/03_pgvector.sql).

CREATE TABLE IF NOT EXISTS regolamento_chunks (
  id text PRIMARY KEY,
  chunk_text text NOT NULL,
  section text,
  page smallint,
  embedding vector(384) NOT NULL,
  model text NOT NULL,
  source text NOT NULL,
  indexed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regolamento_chunks_source_idx ON regolamento_chunks (source);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    GRANT SELECT ON TABLE regolamento_chunks TO palio_chat_ro;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_palio') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE regolamento_chunks TO app_palio;
  END IF;
END
$$;
