ALTER TABLE "ItemMaster" DROP CONSTRAINT IF EXISTS "ItemMaster_companyId_fkey";

ALTER TABLE "ItemMaster" ALTER COLUMN "companyId" DROP NOT NULL;

ALTER TABLE "ItemMaster"
ADD CONSTRAINT "ItemMaster_companyId_fkey"
FOREIGN KEY ("companyId") REFERENCES "Company"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "ItemMaster"
SET "companyId" = NULL;

CREATE INDEX IF NOT EXISTS "ItemMaster_itemType_idx" ON "ItemMaster"("itemType");
