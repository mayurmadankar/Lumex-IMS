DROP INDEX IF EXISTS "InventoryItem_companyId_docId_key";

CREATE INDEX IF NOT EXISTS "InventoryItem_companyId_docId_idx" ON "InventoryItem"("companyId", "docId");
