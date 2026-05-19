ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "InventoryMovementDocumentType" ADD VALUE IF NOT EXISTS 'TRANSFER';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'TRANSFER';

ALTER TABLE "InventorySequence"
ADD COLUMN "nextTransferNumber" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "Transfer" (
  "id" TEXT NOT NULL,
  "docId" INTEGER NOT NULL,
  "transferNo" TEXT NOT NULL,
  "docDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referenceDocNo" TEXT,
  "notes" TEXT,
  "companyId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "fromDepartmentId" TEXT NOT NULL,
  "toDepartmentId" TEXT NOT NULL,
  "toUserId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Transfer_companyId_transferNo_key" ON "Transfer"("companyId", "transferNo");
CREATE UNIQUE INDEX "Transfer_companyId_docId_key" ON "Transfer"("companyId", "docId");
CREATE INDEX "Transfer_companyId_createdAt_idx" ON "Transfer"("companyId", "createdAt" DESC);
CREATE INDEX "Transfer_fromDepartmentId_createdAt_idx" ON "Transfer"("fromDepartmentId", "createdAt" DESC);
CREATE INDEX "Transfer_toDepartmentId_createdAt_idx" ON "Transfer"("toDepartmentId", "createdAt" DESC);
CREATE INDEX "Transfer_inventoryItemId_idx" ON "Transfer"("inventoryItemId");
CREATE INDEX "Transfer_toUserId_idx" ON "Transfer"("toUserId");
CREATE INDEX "Transfer_createdById_idx" ON "Transfer"("createdById");

ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromDepartmentId_fkey" FOREIGN KEY ("fromDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toDepartmentId_fkey" FOREIGN KEY ("toDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
