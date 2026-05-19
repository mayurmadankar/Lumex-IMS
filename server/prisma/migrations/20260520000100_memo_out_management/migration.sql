ALTER TYPE "LotStatus" ADD VALUE IF NOT EXISTS 'MEMO_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'MEMO_OUT';
ALTER TYPE "InventoryMovementType" ADD VALUE IF NOT EXISTS 'MEMO_OUT_RETURN';
ALTER TYPE "InventoryMovementDocumentType" ADD VALUE IF NOT EXISTS 'MEMO_OUT';
ALTER TYPE "AuditEntityType" ADD VALUE IF NOT EXISTS 'MEMO_OUT';

CREATE TABLE "MemoOut" (
  "id" TEXT NOT NULL,
  "docId" INTEGER NOT NULL,
  "memoNo" TEXT NOT NULL,
  "docType" TEXT NOT NULL DEFAULT 'Memo Out',
  "openDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "docDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "referenceDocNo" TEXT,
  "itemType" TEXT,
  "docQty" INTEGER NOT NULL,
  "docWeight" DECIMAL(18,4) NOT NULL,
  "docGrandTotalPrice" DECIMAL(18,2) NOT NULL,
  "mainGrandTotalPrice" DECIMAL(18,2) NOT NULL,
  "balanceAmount" DECIMAL(18,2) NOT NULL,
  "paymentTerm" INTEGER,
  "currency" TEXT NOT NULL DEFAULT 'USD',
  "docRateToMain" DECIMAL(18,8) NOT NULL DEFAULT 1,
  "docRateToSec" DECIMAL(18,8) NOT NULL DEFAULT 1,
  "status" "MemoStatus" NOT NULL DEFAULT 'ACTIVE',
  "companyId" TEXT NOT NULL,
  "departmentId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "sourceMemoOutId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MemoOut_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MemoOut_companyId_memoNo_key" ON "MemoOut"("companyId", "memoNo");
CREATE UNIQUE INDEX "MemoOut_companyId_docId_key" ON "MemoOut"("companyId", "docId");
CREATE INDEX "MemoOut_departmentId_createdAt_idx" ON "MemoOut"("departmentId", "createdAt" DESC);
CREATE INDEX "MemoOut_accountId_idx" ON "MemoOut"("accountId");
CREATE INDEX "MemoOut_inventoryItemId_idx" ON "MemoOut"("inventoryItemId");
CREATE INDEX "MemoOut_sourceMemoOutId_idx" ON "MemoOut"("sourceMemoOutId");
CREATE INDEX "MemoOut_createdById_idx" ON "MemoOut"("createdById");

ALTER TABLE "MemoOut" ADD CONSTRAINT "MemoOut_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoOut" ADD CONSTRAINT "MemoOut_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoOut" ADD CONSTRAINT "MemoOut_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoOut" ADD CONSTRAINT "MemoOut_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MemoOut" ADD CONSTRAINT "MemoOut_sourceMemoOutId_fkey" FOREIGN KEY ("sourceMemoOutId") REFERENCES "MemoOut"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemoOut" ADD CONSTRAINT "MemoOut_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
