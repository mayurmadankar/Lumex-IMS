import { randomBytes } from "node:crypto";

import { z } from "zod";

import {
  accessAllowsModule,
  userCanAccessCompany,
  userHasDepartmentModuleAccess,
} from "../../helper/departmentAccess.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const invoiceNoSchema = z.preprocess(
  emptyToUndefined,
  z.string({ required_error: "Invoice No is required" })
    .trim()
    .min(1, "Invoice No is required")
    .max(80, "Invoice No is too long"),
);

const createTransferRequestSchema = z.object({
  inventoryItemId: z.string({ required_error: "Select an inventory lot" }).uuid("Invalid inventory lot"),
  requesterCompanyId: z.string({ required_error: "Select a receiving company" }).uuid("Invalid receiving company"),
  requesterDepartmentId: z.string({ required_error: "Select a receiving department" }).uuid("Invalid receiving department"),
  requestNote: optionalString(),
});

const decisionSchema = z.object({
  responseNote: optionalString(),
});

const approveDecisionSchema = decisionSchema.extend({
  invoiceNo: invoiceNoSchema,
});

const transferableStockOriginWhere = {
  OR: [
    { purchaseNoteId: { not: null } },
    { returnedFromProductionId: { not: null } },
  ],
};

const numberValue = (value) => Number(value ?? 0);

const normalizeDate = (value) =>
  value instanceof Date ? value.toISOString() : value;

const buildPrefix = (company) =>
  (company.code || company.name || "TRF")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "TRF";

const buildTransferNo = (company, number) =>
  `${buildPrefix(company)}-TRF-${String(number).padStart(6, "0")}`;

const buildRequestNo = () => {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `TRQ-${date}-${randomBytes(3).toString("hex").toUpperCase()}`;
};

const reserveTransferSequence = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "nextMemoNumber",
      "nextInvoiceNumber",
      "nextTransferNumber",
      "updatedAt"
    )
    VALUES (${companyId}, 1, 2, 1, 1, 1, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextTransferNumber" = "InventorySequence"."nextTransferNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextDocumentNumber", "nextTransferNumber";
  `;

  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextTransferNumber = Number(rows[0]?.nextTransferNumber ?? 2);

  return {
    documentNumber: nextDocumentNumber - 1,
    transferNumber: nextTransferNumber - 1,
  };
};

const reserveInvoiceSequence = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "nextMemoNumber",
      "nextInvoiceNumber",
      "updatedAt"
    )
    VALUES (${companyId}, 1, 2, 1, 1, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextInvoiceNumber" = "InventorySequence"."nextInvoiceNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextDocumentNumber", "nextInvoiceNumber";
  `;

  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextInvoiceNumber = Number(rows[0]?.nextInvoiceNumber ?? 2);

  return {
    documentNumber: nextDocumentNumber - 1,
    invoiceNumber: nextInvoiceNumber - 1,
  };
};

const companySelect = { id: true, name: true, code: true };
const departmentSelect = {
  id: true,
  name: true,
  companyId: true,
  company: { select: companySelect },
};
const userSelect = { id: true, fullName: true, email: true };

const inventoryItemInclude = {
  company: { select: companySelect },
  department: { select: departmentSelect },
  vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
  itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
  purchaseNote: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
  returnedFromProduction: { select: { id: true, docId: true, productionNo: true, docType: true, docDate: true, status: true } },
};

const transferSelect = {
  id: true,
  docId: true,
  transferNo: true,
  docDate: true,
  createdAt: true,
};

const transferRequestInclude = {
  inventoryItem: { include: inventoryItemInclude },
  sourceCompany: { select: companySelect },
  sourceDepartment: { select: departmentSelect },
  requesterCompany: { select: companySelect },
  requesterDepartment: { select: departmentSelect },
  requesterUser: { select: userSelect },
  approvedBy: { select: userSelect },
  transfer: { select: transferSelect },
};

const notificationInclude = {
  actorUser: { select: userSelect },
  company: { select: companySelect },
  transferRequest: { include: transferRequestInclude },
};

const mapInventoryItem = (item) => ({
  id: item.id,
  itemId: item.itemId,
  docId: item.docId ?? item.lotId,
  lotId: item.lotId,
  itemType: item.itemType,
  itemMaster: item.itemMaster,
  lotName: item.lotName,
  quantity: item.quantity,
  weight: numberValue(item.weight),
  totalCost: numberValue(item.totalCost),
  labAccountName: item.labAccountName,
  certificateNo: item.certificateNo,
  parcelOrStone: item.parcelOrStone,
  shape: item.shape,
  color: item.color,
  clarity: item.clarity,
  remark: item.remark,
  departmentAccountName: item.departmentAccountName,
  locationAccountName: item.locationAccountName,
  status: item.status,
  createdAt: normalizeDate(item.createdAt),
  company: item.company,
  department: item.department,
  vendorAccount: item.vendorAccount,
  purchaseNote: item.purchaseNote
    ? { ...item.purchaseNote, docDate: normalizeDate(item.purchaseNote.docDate) }
    : null,
  returnedFromProduction: item.returnedFromProduction
    ? {
        ...item.returnedFromProduction,
        docDate: normalizeDate(item.returnedFromProduction.docDate),
      }
    : null,
});

const mapTransferRequest = (request) => ({
  id: request.id,
  requestNo: request.requestNo,
  status: request.status,
  requestNote: request.requestNote,
  responseNote: request.responseNote,
  createdAt: normalizeDate(request.createdAt),
  updatedAt: normalizeDate(request.updatedAt),
  inventoryItem: request.inventoryItem ? mapInventoryItem(request.inventoryItem) : null,
  sourceCompany: request.sourceCompany,
  sourceDepartment: request.sourceDepartment,
  requesterCompany: request.requesterCompany,
  requesterDepartment: request.requesterDepartment,
  requesterUser: request.requesterUser,
  approvedBy: request.approvedBy,
  transfer: request.transfer
    ? {
        ...request.transfer,
        docDate: normalizeDate(request.transfer.docDate),
        createdAt: normalizeDate(request.transfer.createdAt),
      }
    : null,
});

const mapNotification = (notification) => ({
  id: notification.id,
  type: notification.type,
  title: notification.title,
  message: notification.message,
  readAt: normalizeDate(notification.readAt),
  createdAt: normalizeDate(notification.createdAt),
  actorUser: notification.actorUser,
  company: notification.company,
  transferRequest: notification.transferRequest
    ? mapTransferRequest(notification.transferRequest)
    : null,
});

const getUserAccessibleCompanyIds = async (userId) => {
  const accesses = await prisma.userDepartmentAccess.findMany({
    where: { userId },
    select: { department: { select: { companyId: true } } },
  });

  return [
    ...new Set(
      accesses
        .map((access) => access.department?.companyId)
        .filter(Boolean),
    ),
  ];
};

const getCompanyRecipientUserIds = async ({ tx = prisma, companyId }) => {
  const accesses = await tx.userDepartmentAccess.findMany({
    where: {
      department: { companyId },
      user: {
        role: "USER",
        isActive: true,
      },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  return accesses.map((access) => access.userId);
};

const createNotifications = async ({ tx = prisma, notifications }) => {
  const data = notifications.filter((notification) => notification.recipientUserId);
  if (!data.length) return;

  await tx.notification.createMany({ data });
};

const createTransferRequestInvoice = async ({
  tx,
  transferRequest,
  userId,
  responseNote,
  invoiceNo,
}) => {
  const inventoryItem = transferRequest.inventoryItem;
  const totalAmount = numberValue(inventoryItem.totalCost);
  const unitPrice =
    inventoryItem.quantity > 0
      ? totalAmount / inventoryItem.quantity
      : totalAmount;
  const itemName =
    inventoryItem.itemMaster?.itemName ??
    inventoryItem.lotName ??
    inventoryItem.itemType;
  const itemDescription = `${inventoryItem.lotName} - Lot ${inventoryItem.lotId}`;
  const sequence = await reserveInvoiceSequence({
    tx,
    companyId: transferRequest.sourceCompanyId,
  });

  return tx.invoice.create({
    data: {
      docId: sequence.documentNumber,
      invoiceNo,
      docType: "Invoice",
      invoiceType: "INTERNAL_INVOICE",
      docDate: new Date(),
      referenceDocNo: transferRequest.requestNo,
      docQty: inventoryItem.quantity,
      docWeight: inventoryItem.weight,
      subtotalAmount: totalAmount,
      discountAmount: 0,
      taxAmount: 0,
      totalAmount,
      balanceAmount: totalAmount,
      currency: inventoryItem.purchaseNote?.currency ?? "USD",
      notes:
        responseNote ??
        transferRequest.requestNote ??
        `Company transfer to ${transferRequest.requesterCompany.name}`,
      specialInstructions: null,
      status: "ACTIVE",
      companyId: transferRequest.sourceCompanyId,
      departmentId: transferRequest.sourceDepartmentId,
      accountId: null,
      sourceCompanyId: transferRequest.requesterCompanyId,
      createdById: userId,
      items: {
        create: {
          inventoryItemId: null,
          itemMasterId: inventoryItem.itemMasterId,
          itemId: inventoryItem.itemId,
          lotId: inventoryItem.lotId,
          itemName,
          itemDescription,
          quantity: inventoryItem.quantity,
          unitPrice,
          totalAmount,
          weight: inventoryItem.weight,
          labAccountName: inventoryItem.labAccountName,
          certificateNo: inventoryItem.certificateNo,
          parcelOrStone: inventoryItem.parcelOrStone,
          remark: inventoryItem.remark,
        },
      },
    },
    select: {
      id: true,
      invoiceNo: true,
      docId: true,
    },
  });
};

const ensureCanDecideRequest = async ({ req, transferRequest }) => {
  if (
    !(await userCanAccessCompany({
      userId: req.user.userId,
      userRole: req.user.role,
      companyId: transferRequest.sourceCompanyId,
    }))
  ) {
    return "Source company access denied";
  }

  const canTransferSource = await userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId: transferRequest.sourceDepartmentId,
    module: "NEW_TRANSFER",
    access: "READ_WRITE",
  });

  return canTransferSource
    ? null
    : "You do not have transfer approval access for this source department";
};

const ensureUniqueInvoiceNo = async ({ companyId, invoiceNo }) => {
  const existing = await prisma.invoice.findFirst({
    where: { companyId, invoiceNo },
    select: { id: true },
  });
  return !existing;
};

const isInvoiceNoUniqueError = (error) => {
  const target = error?.meta?.target;
  return Array.isArray(target)
    ? target.includes("invoiceNo")
    : typeof target === "string" && target.includes("invoiceNo");
};

export const getCrossCompanyInventory = async (req, res) => {
  const { search, includeOwn } = req.query;
  const accessibleCompanyIds = await getUserAccessibleCompanyIds(req.user.userId);
  const includeOwnCompanies = String(includeOwn ?? "false") === "true";
  const searchValue = String(search ?? "").trim();

  const where = {
    status: "STOCK",
    ...transferableStockOriginWhere,
    ...(includeOwnCompanies || accessibleCompanyIds.length === 0
      ? {}
      : { companyId: { notIn: accessibleCompanyIds } }),
  };

  if (searchValue) {
    const searchClauses = [
      /^\d+$/.test(searchValue) ? { docId: Number(searchValue) } : undefined,
      /^\d+$/.test(searchValue) ? { lotId: Number(searchValue) } : undefined,
      { itemId: { contains: searchValue, mode: "insensitive" } },
      { itemMaster: { itemName: { contains: searchValue, mode: "insensitive" } } },
      { itemMaster: { itemType: { contains: searchValue, mode: "insensitive" } } },
      { lotName: { contains: searchValue, mode: "insensitive" } },
      { certificateNo: { contains: searchValue, mode: "insensitive" } },
      { labAccountName: { contains: searchValue, mode: "insensitive" } },
      { company: { name: { contains: searchValue, mode: "insensitive" } } },
      { department: { name: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);

    where.AND = [
      { OR: transferableStockOriginWhere.OR },
      { OR: searchClauses },
    ];
    delete where.OR;
  }

  const inventoryItems = await prisma.inventoryItem.findMany({
    where,
    orderBy: [{ company: { name: "asc" } }, { lotId: "desc" }],
    include: inventoryItemInclude,
  });
  const pendingRequests = inventoryItems.length
    ? await prisma.transferRequest.findMany({
        where: {
          inventoryItemId: { in: inventoryItems.map((item) => item.id) },
          requesterUserId: req.user.userId,
          status: "PENDING",
        },
        select: {
          id: true,
          requestNo: true,
          inventoryItemId: true,
          status: true,
        },
      })
    : [];
  const pendingRequestByItemId = new Map(
    pendingRequests.map((request) => [request.inventoryItemId, request]),
  );

  return sendSuccess(res, "Cross-company inventory retrieved successfully", {
    inventoryItems: inventoryItems.map((item) => ({
      ...mapInventoryItem(item),
      pendingTransferRequest: pendingRequestByItemId.get(item.id) ?? null,
    })),
  });
};

export const createTransferRequest = async (req, res) => {
  const result = createTransferRequestSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      status: "STOCK",
      ...transferableStockOriginWhere,
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Available inventory lot not found", 404);
  }

  if (inventoryItem.companyId === data.requesterCompanyId) {
    return sendError(res, "Use department transfer for stock inside the same company", 400, {
      requesterCompanyId: ["Select a different receiving company"],
    });
  }

  const [requesterDepartment, requesterAccess, existingRequest] = await Promise.all([
    prisma.department.findFirst({
      where: {
        id: data.requesterDepartmentId,
        companyId: data.requesterCompanyId,
        isActive: true,
      },
      select: departmentSelect,
    }),
    prisma.userDepartmentAccess.findUnique({
      where: {
        userId_departmentId: {
          userId: req.user.userId,
          departmentId: data.requesterDepartmentId,
        },
      },
      select: { permissions: true },
    }),
    prisma.transferRequest.findFirst({
      where: {
        inventoryItemId: inventoryItem.id,
        requesterDepartmentId: data.requesterDepartmentId,
        requesterUserId: req.user.userId,
        status: "PENDING",
      },
      select: { id: true, requestNo: true },
    }),
  ]);

  if (!requesterDepartment) {
    return sendError(res, "Receiving department not found", 404, {
      requesterDepartmentId: ["Select a valid receiving department"],
    });
  }

  if (!requesterAccess) {
    return sendError(res, "Receiving department access denied", 403);
  }

  if (!accessAllowsModule(requesterAccess.permissions, "INVENTORY_LIST", "READ_ONLY")) {
    return sendError(res, "Inventory read access is required in the receiving department", 403);
  }

  if (existingRequest) {
    return sendError(res, `You already requested this lot (${existingRequest.requestNo})`, 409);
  }

  const request = await prisma.$transaction(async (tx) => {
    const created = await tx.transferRequest.create({
      data: {
        requestNo: buildRequestNo(),
        inventoryItemId: inventoryItem.id,
        sourceCompanyId: inventoryItem.companyId,
        sourceDepartmentId: inventoryItem.departmentId,
        requesterCompanyId: requesterDepartment.companyId,
        requesterDepartmentId: requesterDepartment.id,
        requesterUserId: req.user.userId,
        requestNote: data.requestNote ?? null,
      },
      include: transferRequestInclude,
    });

    const recipientUserIds = await getCompanyRecipientUserIds({
      tx,
      companyId: inventoryItem.companyId,
    });

    await createNotifications({
      tx,
      notifications: recipientUserIds.map((recipientUserId) => ({
        recipientUserId,
        actorUserId: req.user.userId,
        companyId: inventoryItem.companyId,
        transferRequestId: created.id,
        type: "TRANSFER_REQUEST_CREATED",
        title: "New item request",
        message: `${requesterDepartment.company.name} requested Lot ${inventoryItem.lotId} from ${inventoryItem.company.name}.`,
      })),
    });

    return created;
  });

  return sendSuccess(res, "Transfer request created successfully", {
    transferRequest: mapTransferRequest(request),
  }, 201);
};

export const getTransferRequests = async (req, res) => {
  const { status } = req.query;
  const accessibleCompanyIds = await getUserAccessibleCompanyIds(req.user.userId);

  if (!accessibleCompanyIds.length) {
    return sendSuccess(res, "Transfer requests retrieved successfully", {
      transferRequests: [],
    });
  }

  const where = {
    OR: [
      { requesterUserId: req.user.userId },
      { sourceCompanyId: { in: accessibleCompanyIds } },
    ],
    ...(status ? { status: String(status).toUpperCase() } : {}),
  };

  const requests = await prisma.transferRequest.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: transferRequestInclude,
  });

  return sendSuccess(res, "Transfer requests retrieved successfully", {
    transferRequests: requests.map(mapTransferRequest),
  });
};

export const getIncomingTransferRequests = async (req, res) => {
  const { status } = req.query;
  const accessibleCompanyIds = await getUserAccessibleCompanyIds(req.user.userId);

  if (!accessibleCompanyIds.length) {
    return sendSuccess(res, "Incoming transfer requests retrieved successfully", {
      transferRequests: [],
    });
  }

  const requests = await prisma.transferRequest.findMany({
    where: {
      sourceCompanyId: { in: accessibleCompanyIds },
      ...(status ? { status: String(status).toUpperCase() } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: transferRequestInclude,
  });

  return sendSuccess(res, "Incoming transfer requests retrieved successfully", {
    transferRequests: requests.map(mapTransferRequest),
  });
};

export const getOutgoingTransferRequests = async (req, res) => {
  const { status } = req.query;

  const requests = await prisma.transferRequest.findMany({
    where: {
      requesterUserId: req.user.userId,
      ...(status ? { status: String(status).toUpperCase() } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: transferRequestInclude,
  });

  return sendSuccess(res, "Outgoing transfer requests retrieved successfully", {
    transferRequests: requests.map(mapTransferRequest),
  });
};

export const approveTransferRequest = async (req, res) => {
  const result = approveDecisionSchema.safeParse(req.body ?? {});
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const transferRequest = await prisma.transferRequest.findUnique({
    where: { id: req.params.id },
    include: transferRequestInclude,
  });

  if (!transferRequest) return sendError(res, "Transfer request not found", 404);
  if (transferRequest.status !== "PENDING") {
    return sendError(res, "Only pending requests can be approved", 400);
  }

  const accessError = await ensureCanDecideRequest({ req, transferRequest });
  if (accessError) return sendError(res, accessError, 403);

  if (
    !(await ensureUniqueInvoiceNo({
      companyId: transferRequest.sourceCompanyId,
      invoiceNo: result.data.invoiceNo,
    }))
  ) {
    return sendError(res, "Invoice No already exists for this company", 409, {
      invoiceNo: ["Invoice No already exists for this company"],
    });
  }

  if (
    transferRequest.inventoryItem.status !== "STOCK" ||
    transferRequest.inventoryItem.companyId !== transferRequest.sourceCompanyId ||
    transferRequest.inventoryItem.departmentId !== transferRequest.sourceDepartmentId
  ) {
    return sendError(res, "Requested stock is no longer available in the source company", 409);
  }

  const [requesterDepartment, requesterAccess] = await Promise.all([
    prisma.department.findFirst({
      where: {
        id: transferRequest.requesterDepartmentId,
        companyId: transferRequest.requesterCompanyId,
        isActive: true,
      },
      select: { id: true },
    }),
    prisma.userDepartmentAccess.findUnique({
      where: {
        userId_departmentId: {
          userId: transferRequest.requesterUserId,
          departmentId: transferRequest.requesterDepartmentId,
        },
      },
      select: {
        permissions: true,
        user: {
          select: {
            isActive: true,
            role: true,
          },
        },
      },
    }),
  ]);

  if (!requesterDepartment) {
    return sendError(res, "Receiving department is no longer active", 409);
  }

  if (
    !requesterAccess?.user?.isActive ||
    requesterAccess.user.role !== "USER" ||
    !accessAllowsModule(requesterAccess.permissions, "INVENTORY_LIST", "READ_ONLY")
  ) {
    return sendError(res, "Requester no longer has inventory access in the receiving department", 409);
  }

  try {
    const updatedRequest = await prisma.$transaction(async (tx) => {
      const sequence = await reserveTransferSequence({
        tx,
        companyId: transferRequest.sourceCompanyId,
      });
      const transferNo = buildTransferNo(
        transferRequest.sourceCompany,
        sequence.transferNumber,
      );

      const createdTransfer = await tx.transfer.create({
        data: {
          docId: sequence.documentNumber,
          transferNo,
          docDate: new Date(),
          referenceDocNo: `Request: ${transferRequest.requestNo}`,
          notes: result.data.responseNote ?? transferRequest.requestNote ?? null,
          companyId: transferRequest.sourceCompanyId,
          inventoryItemId: transferRequest.inventoryItemId,
          fromDepartmentId: transferRequest.sourceDepartmentId,
          toDepartmentId: transferRequest.requesterDepartmentId,
          toUserId: transferRequest.requesterUserId,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: transferRequest.inventoryItemId,
          companyId: transferRequest.sourceCompanyId,
          departmentId: transferRequest.sourceDepartmentId,
          status: "STOCK",
          ...transferableStockOriginWhere,
        },
        data: {
          companyId: transferRequest.requesterCompanyId,
          departmentId: transferRequest.requesterDepartmentId,
          departmentAccountName: transferRequest.requesterDepartment.name,
          locationAccountName: transferRequest.requesterDepartment.name,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      const createdInvoice = await createTransferRequestInvoice({
        tx,
        transferRequest,
        userId: req.user.userId,
        responseNote: result.data.responseNote,
        invoiceNo: result.data.invoiceNo,
      });

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: transferRequest.inventoryItemId,
          event: "TRANSFER",
          fromStatus: "STOCK",
          toStatus: "STOCK",
          documentType: "TRANSFER",
          documentId: createdTransfer.id,
          documentNo: transferNo,
          docId: transferRequest.inventoryItem.docId ?? sequence.documentNumber,
          companyId: transferRequest.requesterCompanyId,
          departmentId: transferRequest.requesterDepartmentId,
          createdById: req.user.userId,
          metadata: {
            transferMode: "COMPANY_REQUEST",
            requestId: transferRequest.id,
            requestNo: transferRequest.requestNo,
            sourceCompanyId: transferRequest.sourceCompanyId,
            sourceCompanyName: transferRequest.sourceCompany.name,
            destinationCompanyId: transferRequest.requesterCompanyId,
            destinationCompanyName: transferRequest.requesterCompany.name,
            fromDepartmentId: transferRequest.sourceDepartmentId,
            fromDepartmentName: transferRequest.sourceDepartment.name,
            toDepartmentId: transferRequest.requesterDepartmentId,
            toDepartmentName: transferRequest.requesterDepartment.name,
            toUserId: transferRequest.requesterUserId,
            toUserName: transferRequest.requesterUser.fullName,
            lotId: transferRequest.inventoryItem.lotId,
            invoiceId: createdInvoice.id,
            invoiceNo: createdInvoice.invoiceNo,
          },
        },
      });

      const otherPendingRequests = await tx.transferRequest.findMany({
        where: {
          inventoryItemId: transferRequest.inventoryItemId,
          status: "PENDING",
          NOT: { id: transferRequest.id },
        },
        select: {
          id: true,
          requestNo: true,
          requesterUserId: true,
        },
      });

      if (otherPendingRequests.length) {
        await tx.transferRequest.updateMany({
          where: {
            id: { in: otherPendingRequests.map((request) => request.id) },
          },
          data: {
            status: "CANCELLED",
            responseNote: "Stock was transferred to another request.",
          },
        });
      }

      const updated = await tx.transferRequest.update({
        where: { id: transferRequest.id },
        data: {
          status: "TRANSFERRED",
          approvedById: req.user.userId,
          transferId: createdTransfer.id,
          responseNote: result.data.responseNote ?? null,
        },
        include: transferRequestInclude,
      });

      await createNotifications({
        tx,
        notifications: [
          {
            recipientUserId: transferRequest.requesterUserId,
            actorUserId: req.user.userId,
            companyId: transferRequest.requesterCompanyId,
            transferRequestId: transferRequest.id,
            type: "TRANSFER_REQUEST_TRANSFERRED",
            title: "Item request approved",
            message: `Your request ${transferRequest.requestNo} was approved, invoiced as ${createdInvoice.invoiceNo}, and transferred.`,
          },
          ...otherPendingRequests.map((request) => ({
            recipientUserId: request.requesterUserId,
            actorUserId: req.user.userId,
            companyId: transferRequest.sourceCompanyId,
            transferRequestId: request.id,
            type: "TRANSFER_REQUEST_REJECTED",
            title: "Item request cancelled",
            message: `Request ${request.requestNo} was cancelled because the stock was transferred to another request.`,
          })),
        ],
      });

      return updated;
    });

    return sendSuccess(res, "Transfer request approved and transferred successfully", {
      transferRequest: mapTransferRequest(updatedRequest),
    });
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Requested stock changed before approval was completed. Refresh and try again.",
        409,
      );
    }

    if (error?.code === "P2002") {
      if (isInvoiceNoUniqueError(error)) {
        return sendError(res, "Invoice No already exists for this company", 409, {
          invoiceNo: ["Invoice No already exists for this company"],
        });
      }

      return sendError(
        res,
        "This lot/doc ID already exists in the destination company. Clean duplicate old stock before transferring this universal lot.",
        409,
      );
    }

    throw error;
  }
};

export const rejectTransferRequest = async (req, res) => {
  const result = decisionSchema.safeParse(req.body ?? {});
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const transferRequest = await prisma.transferRequest.findUnique({
    where: { id: req.params.id },
    include: transferRequestInclude,
  });

  if (!transferRequest) return sendError(res, "Transfer request not found", 404);
  if (transferRequest.status !== "PENDING") {
    return sendError(res, "Only pending requests can be rejected", 400);
  }

  const accessError = await ensureCanDecideRequest({ req, transferRequest });
  if (accessError) return sendError(res, accessError, 403);

  const updatedRequest = await prisma.$transaction(async (tx) => {
    const updated = await tx.transferRequest.update({
      where: { id: transferRequest.id },
      data: {
        status: "REJECTED",
        responseNote: result.data.responseNote ?? null,
      },
      include: transferRequestInclude,
    });

    await createNotifications({
      tx,
      notifications: [
        {
          recipientUserId: transferRequest.requesterUserId,
          actorUserId: req.user.userId,
          companyId: transferRequest.requesterCompanyId,
          transferRequestId: transferRequest.id,
          type: "TRANSFER_REQUEST_REJECTED",
          title: "Item request rejected",
          message: `Your request ${transferRequest.requestNo} was rejected.`,
        },
      ],
    });

    return updated;
  });

  return sendSuccess(res, "Transfer request rejected successfully", {
    transferRequest: mapTransferRequest(updatedRequest),
  });
};

export const getNotifications = async (req, res) => {
  const unreadOnly = String(req.query.unreadOnly ?? "false") === "true";

  const notifications = await prisma.notification.findMany({
    where: {
      recipientUserId: req.user.userId,
      ...(unreadOnly ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: notificationInclude,
  });

  const unreadCount = await prisma.notification.count({
    where: {
      recipientUserId: req.user.userId,
      readAt: null,
    },
  });

  return sendSuccess(res, "Notifications retrieved successfully", {
    notifications: notifications.map(mapNotification),
    unreadCount,
  });
};

export const markNotificationRead = async (req, res) => {
  const updateResult = await prisma.notification.updateMany({
    where: {
      id: req.params.id,
      recipientUserId: req.user.userId,
    },
    data: { readAt: new Date() },
  });

  if (updateResult.count !== 1) {
    return sendError(res, "Notification not found", 404);
  }

  return sendSuccess(res, "Notification marked as read");
};

export const markNotificationsRead = async (req, res) => {
  await prisma.notification.updateMany({
    where: {
      recipientUserId: req.user.userId,
      readAt: null,
    },
    data: { readAt: new Date() },
  });

  return sendSuccess(res, "Notifications marked as read");
};
