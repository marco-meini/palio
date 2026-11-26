-- 0004_chat_history: conversazioni della chat Dimmelo salvate per utente (elenco delle ultime
-- chat, riapertura, titolo generato dall'AI).
--
-- In produzione lo esegue scripts/release.sh (ruolo app_palio). A mano:
--   PGOPTIONS='-c role=app_palio' psql -d palio -v ON_ERROR_STOP=1 -f db/migrations/0004_chat_history.sql
-- Ripetibile (IF NOT EXISTS).

BEGIN;

-- Conversazione di un utente. title NULL finché l'AI non l'ha generato.
CREATE TABLE IF NOT EXISTS chat_conversation (
  id          bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  title       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- ultima attività (ultimo messaggio): ordina l'elenco delle chat
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chat_conversation_user_updated
  ON chat_conversation (user_id, updated_at DESC);

-- Messaggi, in ordine di id. Solo il testo scambiato (non le chiamate ai tool).
CREATE TABLE IF NOT EXISTS chat_message (
  id               bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id  bigint      NOT NULL REFERENCES chat_conversation (id) ON DELETE CASCADE,
  role             text        NOT NULL CHECK (role IN ('user', 'assistant')),
  content          text        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_chat_message_conversation ON chat_message (conversation_id, id);

-- Le conversazioni sono private: il ruolo in sola lettura della chat non le vede.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    REVOKE ALL ON TABLE chat_conversation, chat_message FROM palio_chat_ro;
  END IF;
END
$$;

COMMIT;
