-- Role assignments used to write the new official's plaintext password into
-- audit_logs.newData (fixed in app/api/admin/roles/route.ts). Remove any that
-- were already recorded.
UPDATE "audit_logs"
SET "newData" = "newData" - 'password'
WHERE "newData" ? 'password';
