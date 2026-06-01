-- Create PalioDB database (run on database "postgres" as superuser).
-- Idempotent only if you check first; CREATE DATABASE cannot run inside a transaction.

CREATE DATABASE palio
  OWNER app_palio
  ENCODING 'UTF8'
  TEMPLATE template0;
