import { z } from "zod";

import {
  accessAllowsModule,
  getAccessibleDepartmentIds,
  userCanAccessCompany,
  userHasDepartmentModuleAccess,
} from "../../helper/departmentAccess.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const docDateSchema = z.preprocess(emptyToUndefined, z.string().trim().optional());

const createTransferSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  inventoryItemId: z.string({ required_error: "Select an inventory item" }).uuid("Invalid inventory item"),
  toDepartmentId: z.string({ required_error: "Select a department" }).uuid("Invalid department"),
  toUserId: z.string({ required_error: "Select an employee" }).uuid("Invalid employee"),
  referenceDocNo: optionalString(),
  docDate: docDateSchema,
  notes: optionalString(),
});

const createTransferReturnSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  inventoryItemId: z.string({ required_error: "inventoryItemId is required" }).uuid("Invalid inventory item"),
  referenceDocNo: optionalString(),
  docDate: docDateSchema,
  notes: optionalString(),
});

const numberValue = (value) => Number(value ?? 0);

const normalizeDate = (value) =>
  value instanceof Date ? value.toISOString() : value;

const parseDate = (value) => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const buildPrefix = (company) =>
  (company.code || company.name || "TRF")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "TRF";

const buildTransferNo = (company, number) =>
  `${buildPrefix(company)}-TRF-${String(number).padStart(6, "0")}`;

const transferableStockOriginWhere = {
  OR: [
    { purchaseNoteId: { not: null } },
    { returnedFromProductionId: { not: null } },
  ],
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

const transferInclude = {
  company: { select: { id: true, name: true, code: true } },
  fromDepartment: { select: { id: true, name: true } },
  toDepartment: { select: { id: true, name: true } },
  toUser: { select: { id: true, fullName: true, email: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  inventoryItem: {
    include: {
      company: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
      purchaseNote: { select: { id: true, docId: true, purchaseNo: true, docType: true, docDate: true, status: true, currency: true } },
      memo: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, currency: true } },
      vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
    },
  },
};

const mapInventoryItemSummary = (item) => ({
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
    ? {
        ...item.purchaseNote,
        docDate: normalizeDate(item.purchaseNote.docDate),
      }
    : null,
  memo: item.memo
    ? {
        ...item.memo,
        docDate: normalizeDate(item.memo.docDate),
      }
    : null,
});

const mapTransfer = (transfer) => ({
  id: transfer.id,
  docId: transfer.inventoryItem?.docId ?? transfer.docId,
  transferNo: transfer.transferNo,
  docType: isTransferReturn(transfer) ? "Transfer Return" : "Transfer",
  docDate: normalizeDate(transfer.docDate),
  referenceDocNo: transfer.referenceDocNo,
  notes: transfer.notes,
  createdAt: normalizeDate(transfer.createdAt),
  company: transfer.company,
  fromDepartment: transfer.fromDepartment,
  toDepartment: transfer.toDepartment,
  toUser: transfer.toUser,
  createdBy: transfer.createdBy,
  inventoryItem: transfer.inventoryItem
    ? mapInventoryItemSummary(transfer.inventoryItem)
    : null,
});

const isTransferReturn = (transfer) =>
  String(transfer.referenceDocNo ?? "").includes("Transfer Return:");

const mapTransferReturnCandidate = ({ inventoryItem, transfer }) => ({
  inventoryItem: mapInventoryItemSummary(inventoryItem),
  transfer: mapTransfer(transfer),
  returnToDepartment: transfer.fromDepartment,
  returnToUser: transfer.createdBy,
});

export const getCompanyDepartments = async (req, res) => {
  const companyId = String(req.query.companyId ?? "").trim();
  if (!companyId) return sendError(res, "companyId is required", 400);

  const canTransferInCompany = (
    await getAccessibleDepartmentIds({
      userId: req.user.userId,
      userRole: req.user.role,
      companyId,
      module: "NEW_TRANSFER",
      access: "READ_WRITE",
    })
  ).length > 0;

  if (!canTransferInCompany) {
    return sendError(res, "Transfer access denied for this company", 403);
  }

  const departments = await prisma.department.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      country: true,
      companyId: true,
    },
  });

  return sendSuccess(res, "Departments retrieved successfully", { departments });
};

export const getDepartmentUsers = async (req, res) => {
  const departmentId = String(req.params.departmentId ?? "").trim();
  if (!departmentId) return sendError(res, "departmentId is required", 400);

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: { id: true, companyId: true },
  });

  if (!department) return sendError(res, "Department not found", 404);

  const canTransferInCompany = (
    await getAccessibleDepartmentIds({
      userId: req.user.userId,
      userRole: req.user.role,
      companyId: department.companyId,
      module: "NEW_TRANSFER",
      access: "READ_WRITE",
    })
  ).length > 0;

  if (!canTransferInCompany) {
    return sendError(res, "Transfer access denied for this company", 403);
  }

  const accesses = await prisma.userDepartmentAccess.findMany({
    where: {
      departmentId,
      user: {
        role: "USER",
        isActive: true,
      },
    },
    orderBy: { user: { fullName: "asc" } },
    select: {
      permissions: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
        },
      },
    },
  });

  const users = accesses
    .filter((access) =>
      accessAllowsModule(access.permissions, "INVENTORY_LIST", "READ_ONLY"),
    )
    .map((access) => access.user);

  return sendSuccess(res, "Department users retrieved successfully", { users });
};

export const createTransfer = async (req, res) => {
  const result = createTransferSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;

  if (
    !(await userCanAccessCompany({
      userId: req.user.userId,
      userRole: req.user.role,
      companyId: data.companyId,
    }))
  ) {
    return sendError(res, "Company access denied", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      companyId: data.companyId,
      status: "STOCK",
      ...transferableStockOriginWhere,
    },
    include: {
      company: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
      vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
      purchaseNote: { select: { id: true, docId: true, purchaseNo: true, docType: true, docDate: true, status: true, currency: true } },
      memo: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, currency: true } },
    },
  });

  if (!inventoryItem) {
    return sendError(res, "Available inventory item not found", 404);
  }

  const canTransferSource = await userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId: inventoryItem.departmentId,
    module: "NEW_TRANSFER",
    access: "READ_WRITE",
  });

  if (!canTransferSource) {
    return sendError(res, "You do not have transfer write access for this item department", 403);
  }

  if (inventoryItem.departmentId === data.toDepartmentId) {
    return sendError(res, "Select a different destination department", 400, {
      toDepartmentId: ["Select a different destination department"],
    });
  }

  const [toDepartment, toUserAccess] = await Promise.all([
    prisma.department.findFirst({
      where: {
        id: data.toDepartmentId,
        companyId: data.companyId,
        isActive: true,
      },
      select: {
        id: true,
        name: true,
        companyId: true,
      },
    }),
    prisma.userDepartmentAccess.findUnique({
      where: {
        userId_departmentId: {
          userId: data.toUserId,
          departmentId: data.toDepartmentId,
        },
      },
      select: {
        permissions: true,
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            isActive: true,
            role: true,
          },
        },
      },
    }),
  ]);

  if (!toDepartment) {
    return sendError(res, "Destination department not found", 404, {
      toDepartmentId: ["Select a valid department"],
    });
  }

  if (
    !toUserAccess?.user ||
    !toUserAccess.user.isActive ||
    toUserAccess.user.role !== "USER" ||
    !accessAllowsModule(toUserAccess.permissions, "INVENTORY_LIST", "READ_ONLY")
  ) {
    return sendError(res, "Selected employee cannot view inventory in this department", 400, {
      toUserId: ["Select an employee with inventory read access"],
    });
  }

  try {
    const transfer = await prisma.$transaction(async (tx) => {
      const sequence = await reserveTransferSequence({
        tx,
        companyId: data.companyId,
      });
      const transferNo = buildTransferNo(
        inventoryItem.company,
        sequence.transferNumber,
      );

      const created = await tx.transfer.create({
        data: {
          docId: sequence.documentNumber,
          transferNo,
          docDate: parseDate(data.docDate),
          referenceDocNo: data.referenceDocNo ?? null,
          notes: data.notes ?? null,
          companyId: data.companyId,
          inventoryItemId: inventoryItem.id,
          fromDepartmentId: inventoryItem.departmentId,
          toDepartmentId: toDepartment.id,
          toUserId: toUserAccess.user.id,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          status: "STOCK",
          ...transferableStockOriginWhere,
        },
        data: {
          departmentId: toDepartment.id,
          departmentAccountName: toDepartment.name,
          locationAccountName: toDepartment.name,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: inventoryItem.id,
          event: "TRANSFER",
          fromStatus: "STOCK",
          toStatus: "STOCK",
          documentType: "TRANSFER",
          documentId: created.id,
          documentNo: transferNo,
          docId: inventoryItem.docId ?? sequence.documentNumber,
          companyId: data.companyId,
          departmentId: toDepartment.id,
          createdById: req.user.userId,
          metadata: {
            referenceDocNo: data.referenceDocNo ?? null,
            fromDepartmentId: inventoryItem.departmentId,
            fromDepartmentName: inventoryItem.department.name,
            toDepartmentId: toDepartment.id,
            toDepartmentName: toDepartment.name,
            toUserId: toUserAccess.user.id,
            toUserName: toUserAccess.user.fullName,
            lotId: inventoryItem.lotId,
          },
        },
      });

      return tx.transfer.findUnique({
        where: { id: created.id },
        include: transferInclude,
      });
    });

    return sendSuccess(
      res,
      "Transfer created successfully",
      { transfer: mapTransfer(transfer) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected inventory item changed before transfer was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getTransferReturnItemByLot = async (req, res) => {
  const companyId = String(req.query.companyId ?? "").trim();
  const lotId = Number(req.params.lotId);

  if (!companyId) return sendError(res, "companyId is required", 400);
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return sendError(res, "Valid lotId is required", 400);
  }

  const departmentIds = await getAccessibleDepartmentIds({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
    module: "NEW_TRANSFER_RETURN",
    access: "READ_WRITE",
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Transfer return access denied for this company", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      companyId,
      departmentId: { in: departmentIds },
      lotId,
      status: "STOCK",
      ...transferableStockOriginWhere,
    },
    include: transferInclude.inventoryItem.include,
  });

  if (!inventoryItem) {
    return sendError(res, "Transferred stock item not found for this Lot ID", 404);
  }

  const latestTransfer = await prisma.transfer.findFirst({
    where: {
      companyId,
      inventoryItemId: inventoryItem.id,
    },
    orderBy: { createdAt: "desc" },
    include: transferInclude,
  });

  if (!latestTransfer) {
    return sendError(res, "No transfer found for this Lot ID", 404);
  }

  if (isTransferReturn(latestTransfer)) {
    return sendError(res, "The latest transfer for this Lot ID is already a return", 400);
  }

  if (latestTransfer.toDepartmentId !== inventoryItem.departmentId) {
    return sendError(res, "This Lot ID is no longer in the latest transfer destination department", 409);
  }

  return sendSuccess(res, "Transfer return item retrieved successfully", {
    transferReturnItem: mapTransferReturnCandidate({
      inventoryItem,
      transfer: latestTransfer,
    }),
  });
};

export const createTransferReturn = async (req, res) => {
  const result = createTransferReturnSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      companyId: data.companyId,
      status: "STOCK",
      ...transferableStockOriginWhere,
    },
    include: transferInclude.inventoryItem.include,
  });

  if (!inventoryItem) {
    return sendError(res, "Transferred stock item not found", 404);
  }

  const latestTransfer = await prisma.transfer.findFirst({
    where: {
      companyId: data.companyId,
      inventoryItemId: inventoryItem.id,
    },
    orderBy: { createdAt: "desc" },
    include: transferInclude,
  });

  if (!latestTransfer) {
    return sendError(res, "No transfer found for selected item", 404);
  }

  if (isTransferReturn(latestTransfer)) {
    return sendError(res, "The latest transfer for this item is already a return", 400);
  }

  if (latestTransfer.toDepartmentId !== inventoryItem.departmentId) {
    return sendError(res, "Selected item changed before transfer return was completed. Refresh and try again.", 409);
  }

  const canReturn = await userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId: inventoryItem.departmentId,
    module: "NEW_TRANSFER_RETURN",
    access: "READ_WRITE",
  });

  if (!canReturn) {
    return sendError(res, "You do not have transfer return access for this item department", 403);
  }

  const toUserAccess = await prisma.userDepartmentAccess.findUnique({
    where: {
      userId_departmentId: {
        userId: latestTransfer.createdById,
        departmentId: latestTransfer.fromDepartmentId,
      },
    },
    select: {
      permissions: true,
      user: {
        select: {
          id: true,
          fullName: true,
          email: true,
          isActive: true,
          role: true,
        },
      },
    },
  });
  const returnToUserId =
    toUserAccess?.user?.isActive &&
    toUserAccess.user.role === "USER" &&
    accessAllowsModule(toUserAccess.permissions, "INVENTORY_LIST", "READ_ONLY")
      ? toUserAccess.user.id
      : null;
  const referenceDocNo = data.referenceDocNo
    ? `${data.referenceDocNo} | Transfer Return: ${latestTransfer.transferNo}`
    : `Transfer Return: ${latestTransfer.transferNo}`;

  try {
    const transferReturn = await prisma.$transaction(async (tx) => {
      const sequence = await reserveTransferSequence({
        tx,
        companyId: data.companyId,
      });
      const transferNo = buildTransferNo(
        inventoryItem.company,
        sequence.transferNumber,
      );

      const created = await tx.transfer.create({
        data: {
          docId: sequence.documentNumber,
          transferNo,
          docDate: parseDate(data.docDate),
          referenceDocNo,
          notes: data.notes ?? `Return of transfer ${latestTransfer.transferNo}`,
          companyId: data.companyId,
          inventoryItemId: inventoryItem.id,
          fromDepartmentId: inventoryItem.departmentId,
          toDepartmentId: latestTransfer.fromDepartmentId,
          toUserId: returnToUserId,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          status: "STOCK",
          ...transferableStockOriginWhere,
        },
        data: {
          departmentId: latestTransfer.fromDepartmentId,
          departmentAccountName: latestTransfer.fromDepartment.name,
          locationAccountName: latestTransfer.fromDepartment.name,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await tx.inventoryMovement.create({
        data: {
          inventoryItemId: inventoryItem.id,
          event: "TRANSFER",
          fromStatus: "STOCK",
          toStatus: "STOCK",
          documentType: "TRANSFER",
          documentId: created.id,
          documentNo: transferNo,
          docId: inventoryItem.docId ?? sequence.documentNumber,
          companyId: data.companyId,
          departmentId: latestTransfer.fromDepartmentId,
          createdById: req.user.userId,
          metadata: {
            transferType: "RETURN",
            referenceDocNo,
            originalTransferId: latestTransfer.id,
            originalTransferNo: latestTransfer.transferNo,
            fromDepartmentId: inventoryItem.departmentId,
            fromDepartmentName: inventoryItem.department.name,
            toDepartmentId: latestTransfer.fromDepartmentId,
            toDepartmentName: latestTransfer.fromDepartment.name,
            toUserId: returnToUserId,
            lotId: inventoryItem.lotId,
          },
        },
      });

      return tx.transfer.findUnique({
        where: { id: created.id },
        include: transferInclude,
      });
    });

    return sendSuccess(
      res,
      "Transfer return created successfully",
      { transfer: mapTransfer(transferReturn) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected inventory item changed before transfer return was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getTransfers = async (req, res) => {
  const { companyId, departmentId, search } = req.query;
  const searchValue = String(search ?? "").trim();
  const where = {};

  if (departmentId) {
    const department = await prisma.department.findUnique({
      where: { id: String(departmentId) },
      select: { id: true, companyId: true },
    });
    if (!department) return sendError(res, "Department not found", 404);

    const canRead = await userHasDepartmentModuleAccess({
      userId: req.user.userId,
      userRole: req.user.role,
      departmentId: department.id,
      module: "TRANSFER_LIST",
      access: "READ_ONLY",
    });
    if (!canRead) return sendError(res, "Transfer list access denied", 403);

    where.companyId = department.companyId;
    where.OR = [
      { fromDepartmentId: department.id },
      { toDepartmentId: department.id },
    ];
  } else {
    if (!companyId) return sendError(res, "companyId is required", 400);

    const departmentIds = await getAccessibleDepartmentIds({
      userId: req.user.userId,
      userRole: req.user.role,
      companyId: String(companyId),
      module: "TRANSFER_LIST",
      access: "READ_ONLY",
    });

    if (departmentIds.length === 0) {
      return sendError(res, "Transfer list access denied for this company", 403);
    }

    where.companyId = String(companyId);
    where.OR = [
      { fromDepartmentId: { in: departmentIds } },
      { toDepartmentId: { in: departmentIds } },
    ];
  }

  if (searchValue) {
    const searchClauses = [
      /^\d+$/.test(searchValue) ? { docId: Number(searchValue) } : undefined,
      /^\d+$/.test(searchValue) ? { inventoryItem: { docId: Number(searchValue) } } : undefined,
      /^\d+$/.test(searchValue) ? { inventoryItem: { lotId: Number(searchValue) } } : undefined,
      { transferNo: { contains: searchValue, mode: "insensitive" } },
      { referenceDocNo: { contains: searchValue, mode: "insensitive" } },
      { notes: { contains: searchValue, mode: "insensitive" } },
      { inventoryItem: { itemId: { contains: searchValue, mode: "insensitive" } } },
      { inventoryItem: { lotName: { contains: searchValue, mode: "insensitive" } } },
      { inventoryItem: { itemMaster: { itemName: { contains: searchValue, mode: "insensitive" } } } },
      { fromDepartment: { name: { contains: searchValue, mode: "insensitive" } } },
      { toDepartment: { name: { contains: searchValue, mode: "insensitive" } } },
      { toUser: { fullName: { contains: searchValue, mode: "insensitive" } } },
      { createdBy: { fullName: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);

    where.AND = [
      {
        OR: where.OR,
      },
      {
        OR: searchClauses,
      },
    ];
    delete where.OR;
  }

  const transfers = await prisma.transfer.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: transferInclude,
  });

  return sendSuccess(res, "Transfers retrieved successfully", {
    transfers: transfers.map(mapTransfer),
  });
};
