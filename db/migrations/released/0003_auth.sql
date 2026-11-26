-- 0003_auth: login OIDC con ZITADEL e sessioni server-side. Sostituisce il login Google con
-- allowlist dimmelo_users.
--
-- In produzione lo esegue scripts/release.sh (ruolo app_palio). A mano:
--   psql -d palio -v ON_ERROR_STOP=1 -f db/migrations/0003_auth.sql
-- Ripetibile (IF NOT EXISTS): si può eseguire prima del rilascio (es. per provare in locale sul
-- DB di produzione) e release.sh lo riesegue senza effetti.
--
-- Chi può entrare e con quali permessi lo decide ZITADEL: ruoli del progetto Dimmelo
-- (chat.use, users.view, users.manage) assegnati agli utenti. Qui solo il profilo di chi è
-- entrato almeno una volta e le sessioni.
-- Gli utenti di dimmelo_users si portano su ZITADEL con `npm run import:dimmelo-users`
-- (server/src/tasks/import-dimmelo-users.ts). dimmelo_users resta com'è (non più letta dall'app).

BEGIN;

-- Utente che è entrato almeno una volta: profilo copiato dall'ID token a ogni login.
CREATE TABLE IF NOT EXISTS app_user (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idp_user_id    text        NOT NULL UNIQUE,
  display_name   text        NOT NULL,
  email          text,
  last_login_at  timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN app_user.idp_user_id IS 'Id dell''utente su ZITADEL (claim sub)';

-- Sessione di login. Il cookie contiene un id casuale; qui se ne salva solo l'hash SHA-256.
-- I permessi sono quelli dell'ultimo token: si aggiornano con il refresh token (cifrato).
CREATE TABLE IF NOT EXISTS user_session (
  id_hash            text        PRIMARY KEY,
  user_id            bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  user_agent         text,
  permissions        text[]      NOT NULL DEFAULT '{}',
  refresh_token_enc  text,
  id_token           text,
  refreshed_at       timestamptz NOT NULL DEFAULT now(),
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_seen_at       timestamptz NOT NULL DEFAULT now(),
  expires_at         timestamptz NOT NULL
);

COMMENT ON COLUMN user_session.refresh_token_enc IS
  'Refresh token di ZITADEL cifrato (AES-256-GCM, chiave derivata da COOKIE_SECRET)';
COMMENT ON COLUMN user_session.id_token IS 'Ultimo ID token: id_token_hint per il logout su ZITADEL';

CREATE INDEX IF NOT EXISTS ix_user_session_user_id ON user_session (user_id);
CREATE INDEX IF NOT EXISTS ix_user_session_expires_at ON user_session (expires_at);

-- Le tabelle di autenticazione non sono per la chat: il ruolo in sola lettura non le vede.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    REVOKE ALL ON TABLE app_user, user_session FROM palio_chat_ro;
  END IF;
END
$$;

COMMIT;
