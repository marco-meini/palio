-- Authorized Dimmelo chat users (Google OAuth allowlist + display names).
-- Apply: postgres CLI or psql against your app database.

BEGIN;

CREATE TABLE IF NOT EXISTS dimmelo_users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT dimmelo_users_email_key UNIQUE (email),
  CONSTRAINT dimmelo_users_email_lowercase CHECK (email = lower(email))
);

INSERT INTO dimmelo_users (email, display_name)
VALUES ('marco.meini.1979@gmail.com', 'Marco')
ON CONFLICT (email) DO NOTHING;

COMMIT;
