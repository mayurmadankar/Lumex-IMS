CREATE TYPE "TransferRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'TRANSFERRED', 'CANCELLED');
CREATE TYPE "NotificationType" AS ENUM (
  'TRANSFER_REQUEST_CREATED',
  'TRANSFER_REQUEST_APPROVED',
  'TRANSFER_REQUEST_REJECTED',
  'TRANSFER_REQUEST_TRANSFERRED'
);

CREATE TABLE "TransferRequest" (
  "id" TEXT NOT NULL,
  "requestNo" TEXT NOT NULL,
  "inventoryItemId" TEXT NOT NULL,
  "sourceCompanyId" TEXT NOT NULL,
  "sourceDepartmentId" TEXT NOT NULL,
  "requesterCompanyId" TEXT NOT NULL,
  "requesterDepartmentId" TEXT NOT NULL,
  "requesterUserId" TEXT NOT NULL,
  "approvedById" TEXT,
  "transferId" TEXT,
  "status" "TransferRequestStatus" NOT NULL DEFAULT 'PENDING',
  "requestNote" TEXT,
  "responseNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TransferRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Notification" (
  "id" TEXT NOT NULL,
  "recipientUserId" TEXT NOT NULL,
  "actorUserId" TEXT,
  "companyId" TEXT,
  "transferRequestId" TEXT,
  "type" "NotificationType" NOT NULL,
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TransferRequest_requestNo_key" ON "TransferRequest"("requestNo");
CREATE UNIQUE INDEX "TransferRequest_transferId_key" ON "TransferRequest"("transferId");
CREATE INDEX "TransferRequest_inventoryItemId_idx" ON "TransferRequest"("inventoryItemId");
CREATE INDEX "TransferRequest_sourceCompanyId_status_createdAt_idx" ON "TransferRequest"("sourceCompanyId", "status", "createdAt" DESC);
CREATE INDEX "TransferRequest_sourceDepartmentId_status_createdAt_idx" ON "TransferRequest"("sourceDepartmentId", "status", "createdAt" DESC);
CREATE INDEX "TransferRequest_requesterCompanyId_status_createdAt_idx" ON "TransferRequest"("requesterCompanyId", "status", "createdAt" DESC);
CREATE INDEX "TransferRequest_requesterDepartmentId_status_createdAt_idx" ON "TransferRequest"("requesterDepartmentId", "status", "createdAt" DESC);
CREATE INDEX "TransferRequest_requesterUserId_createdAt_idx" ON "TransferRequest"("requesterUserId", "createdAt" DESC);
CREATE INDEX "TransferRequest_approvedById_idx" ON "TransferRequest"("approvedById");

CREATE INDEX "Notification_recipientUserId_readAt_createdAt_idx" ON "Notification"("recipientUserId", "readAt", "createdAt" DESC);
CREATE INDEX "Notification_companyId_createdAt_idx" ON "Notification"("companyId", "createdAt" DESC);
CREATE INDEX "Notification_transferRequestId_idx" ON "Notification"("transferRequestId");
CREATE INDEX "Notification_actorUserId_idx" ON "Notification"("actorUserId");

ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_sourceCompanyId_fkey" FOREIGN KEY ("sourceCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_sourceDepartmentId_fkey" FOREIGN KEY ("sourceDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_requesterCompanyId_fkey" FOREIGN KEY ("requesterCompanyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_requesterDepartmentId_fkey" FOREIGN KEY ("requesterDepartmentId") REFERENCES "Department"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_requesterUserId_fkey" FOREIGN KEY ("requesterUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TransferRequest" ADD CONSTRAINT "TransferRequest_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Notification" ADD CONSTRAINT "Notification_recipientUserId_fkey" FOREIGN KEY ("recipientUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_transferRequestId_fkey" FOREIGN KEY ("transferRequestId") REFERENCES "TransferRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
