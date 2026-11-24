-- 0003_auth: utenti dell'app con passkey su ZITADEL, permessi e sessioni server-side
-- (stesso metodo di dimora). Sostituisce il login Google con allowlist dimmelo_users.
--
-- In produzione lo esegue scripts/release.sh (ruolo app_palio). A mano:
--   psql -d palio -v ON_ERROR_STOP=1 -f db/migrations/0003_auth.sql
--
-- Utenti di partenza: quelli di dimmelo_users. Il più vecchio (id minore) diventa
-- amministratore; tutti ricevono il permesso della chat. Nessuno ha ancora l'account ZITADEL
-- collegato: ognuno entra la prima volta con «Non riesci ad accedere?» (link via email) o con
-- un invito dalla pagina Utenti, e crea la sua passkey.
-- dimmelo_users resta com'è (non più letta dall'app).

BEGIN;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END
$$;

-- Utente dell'app. palio è la fonte di verità (anagrafica, permessi, stato); l'identità e le
-- passkey stanno su ZITADEL, collegate tramite idp_user_id.
CREATE TABLE app_user (
  id                     bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idp_user_id            text        UNIQUE,
  first_name             text        NOT NULL,
  last_name              text        NOT NULL,
  display_name           text        NOT NULL,
  email                  text        NOT NULL,
  phone                  text,
  is_admin               boolean     NOT NULL DEFAULT false,
  disabled_at            timestamptz,
  created_by             bigint      REFERENCES app_user (id) ON DELETE SET NULL,
  last_login_at          timestamptz,
  access_link_hash       text        UNIQUE,
  access_link_expires_at timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN app_user.idp_user_id IS
  'Id dell''utente su ZITADEL; NULL finché non apre il primo link d''accesso';
COMMENT ON COLUMN app_user.access_link_hash IS
  'SHA-256 del link d''accesso valido (invito o recupero): uno solo per utente';

CREATE UNIQUE INDEX ux_app_user_email ON app_user (lower(email));

CREATE TRIGGER trg_app_user_updated_at
  BEFORE UPDATE ON app_user
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Permessi `<sezione>.<azione>` (es. chat.use, users.view). Il catalogo sta nel codice
-- dell'API; qui si salva solo chi ha cosa. L'amministratore li ha tutti.
CREATE TABLE user_permission (
  user_id     bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  permission  text        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, permission)
);

-- Sessione di login. Il cookie contiene un id casuale; qui se ne salva solo l'hash SHA-256.
CREATE TABLE user_session (
  id_hash       text        PRIMARY KEY,
  user_id       bigint      NOT NULL REFERENCES app_user (id) ON DELETE CASCADE,
  user_agent    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL
);

CREATE INDEX ix_user_session_user_id ON user_session (user_id);
CREATE INDEX ix_user_session_expires_at ON user_session (expires_at);

-- Utenti di partenza da dimmelo_users: nome e cognome dal display_name.
INSERT INTO app_user (first_name, last_name, display_name, email, is_admin)
SELECT split_part(d.name, ' ', 1),
       btrim(substr(d.name, length(split_part(d.name, ' ', 1)) + 1)),
       d.name,
       lower(d.email),
       d.id = (SELECT min(id) FROM dimmelo_users)
  FROM (SELECT id, email, regexp_replace(btrim(display_name), '\s+', ' ', 'g') AS name
          FROM dimmelo_users) d
 ORDER BY d.id;

INSERT INTO user_permission (user_id, permission)
SELECT id, 'chat.use' FROM app_user;

-- Le tabelle di autenticazione non sono per la chat: il ruolo in sola lettura non le vede.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'palio_chat_ro') THEN
    REVOKE ALL ON TABLE app_user, user_permission, user_session FROM palio_chat_ro;
  END IF;
END
$$;

COMMIT;
