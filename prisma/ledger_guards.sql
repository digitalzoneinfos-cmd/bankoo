-- Run after `prisma migrate`. Database-level guarantees that do not depend on application code.

-- 1) Append-only ledger
CREATE OR REPLACE FUNCTION bankoo_forbid_change() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'ledger is append-only'; END; $$ LANGUAGE plpgsql;
CREATE TRIGGER ledger_entry_immutable BEFORE UPDATE OR DELETE ON "LedgerEntry" FOR EACH ROW EXECUTE FUNCTION bankoo_forbid_change();
CREATE TRIGGER ledger_tx_immutable    BEFORE UPDATE OR DELETE ON "Transaction" FOR EACH ROW EXECUTE FUNCTION bankoo_forbid_change();

-- 2) Every transaction must balance (checked at COMMIT)
CREATE OR REPLACE FUNCTION bankoo_check_balanced() RETURNS trigger AS $$
BEGIN
  IF (SELECT COALESCE(SUM(amount),0) FROM "LedgerEntry" WHERE "txId" = NEW."txId") <> 0 THEN
    RAISE EXCEPTION 'unbalanced transaction %', NEW."txId";
  END IF; RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_balanced AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bankoo_check_balanced();

-- 3) Student accounts never negative (application also locks the account row FOR UPDATE)
CREATE OR REPLACE FUNCTION bankoo_check_non_negative() RETURNS trigger AS $$
BEGIN
  IF NOT (SELECT "allowNegative" FROM "LedgerAccount" WHERE id = NEW."accountId")
     AND (SELECT SUM(amount) FROM "LedgerEntry" WHERE "accountId" = NEW."accountId") < 0 THEN
    RAISE EXCEPTION 'negative balance on %', NEW."accountId";
  END IF; RETURN NULL;
END; $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER ledger_non_negative AFTER INSERT ON "LedgerEntry"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION bankoo_check_non_negative();

-- 4) Row-Level Security: the API sets `SET LOCAL app.tenant_id = '<id>'` per request.
ALTER TABLE "LedgerAccount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "LedgerAccount" USING ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "Transaction" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Transaction" USING ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "StudentProfile" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "StudentProfile" USING ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "Order" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Order" USING ("tenantId" = current_setting('app.tenant_id', true));
ALTER TABLE "Product" ENABLE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON "Product" USING ("tenantId" = current_setting('app.tenant_id', true));
-- (repeat for every tenant-scoped table in the migration)
