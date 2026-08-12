-- Pittore del drappellone (sommario ilpalio: #spAutoreDrappellone).

BEGIN;

ALTER TABLE palii
  ADD COLUMN IF NOT EXISTS pittore_drappellone text;

COMMENT ON COLUMN palii.pittore_drappellone IS
  'Nome del pittore del drappellone (da sommario #spAutoreDrappellone); NULL se assente';

COMMIT;
