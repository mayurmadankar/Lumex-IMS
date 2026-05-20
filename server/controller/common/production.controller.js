import { z } from "zod";

import {
  getAccessibleDepartmentIds,
  getAccessibleDepartmentIdsForAnyModule,
  userCanAccessCompany,
  userHasDepartmentModuleAccess,
} from "../../helper/departmentAccess.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const PARCEL_OR_STONE = ["PARCEL", "STONE"];

const productionAccessChecks = [
  { module: "CHANGE_LOCATION", access: "READ_WRITE" },
  { module: "SEND_TO_PROCESS", access: "READ_WRITE" },
  { module: "RETURN_PARTS", access: "READ_WRITE" },
];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const docDateSchema = z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalDecimal = () =>
  z.preprocess(emptyToUndefined, z.coerce.number().optional());

const nonNegativeDecimal = (fieldName) =>
  z.preprocess(
    emptyToUndefined,
    z.coerce.number().min(0, `${fieldName} cannot be negative`).optional(),
  );

const changeLocationSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  inventoryItemId: z.string({ required_error: "Select an inventory item" }).uuid("Invalid inventory item"),
  toLocationAccountName: z.string({ required_error: "New location is required" }).trim().min(1, "New location is required"),
  referenceDocNo: optionalString(),
  docDate: docDateSchema,
  notes: optionalString(),
});

const sendToProcessSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  inventoryItemId: z.string({ required_error: "Select an inventory item" }).uuid("Invalid inventory item"),
  processAccountName: z.string({ required_error: "Process account is required" }).trim().min(1, "Process account is required"),
  referenceDocNo: optionalString(),
  docDate: docDateSchema,
  expectedReturnDate: docDateSchema,
  notes: optionalString(),
});

const returnPartSchema = z.object({
  itemMasterId: z.preprocess(emptyToUndefined, z.string().uuid("Invalid item").optional()),
  lotName: z.string({ required_error: "Lot name is required" }).trim().min(1, "Lot name is required"),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0"),
  weight: z.coerce.number().positive("Weight must be greater than 0"),
  totalCost: z.coerce.number().min(0, "Total cost cannot be negative"),
  labAccountName: optionalString(),
  certificateNo: optionalString(),
  parcelOrStone: z.enum(PARCEL_OR_STONE).optional(),
  shape: optionalString(),
  color: optionalString(),
  clarity: optionalString(),
  rap: optionalDecimal(),
  mainDiscount: optionalDecimal(),
  remark: optionalString(),
});

const returnPartsSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  inventoryItemId: z.string({ required_error: "inventoryItemId is required" }).uuid("Invalid inventory item"),
  sourceProductionId: z.string({ required_error: "sourceProductionId is required" }).uuid("Invalid production document"),
  returnLocationAccountName: z.string({ required_error: "Return location is required" }).trim().min(1, "Return location is required"),
  referenceDocNo: optionalString(),
  docDate: docDateSchema,
  notes: optionalString(),
  lossWeight: nonNegativeDecimal("Loss weight").default(0),
  parts: z.array(returnPartSchema).min(1, "Add at least one returned part"),
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
  (company.code || company.name || "PRD")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "PRD";

const buildProductionNo = (company, number) =>
  `${buildPrefix(company)}-PRD-${String(number).padStart(6, "0")}`;

const buildItemId = (company, lotId) =>
  `${buildPrefix(company)}-ITEM-${String(lotId).padStart(6, "0")}`;

const productionStockOriginWhere = {
  OR: [
    { purchaseNoteId: { not: null } },
    { returnedFromProductionId: { not: null } },
  ],
};

const reserveProductionSequence = async ({ tx, companyId, itemCount = 0 }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "nextMemoNumber",
      "nextInvoiceNumber",
      "nextTransferNumber",
      "nextProductionNumber",
      "updatedAt"
    )
    VALUES (${companyId}, ${itemCount + 1}, 2, 1, 1, 1, 1, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextLotId" = "InventorySequence"."nextLotId" + ${itemCount},
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextProductionNumber" = "InventorySequence"."nextProductionNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextLotId", "nextDocumentNumber", "nextProductionNumber";
  `;

  const nextLotId = Number(rows[0]?.nextLotId ?? itemCount + 1);
  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextProductionNumber = Number(rows[0]?.nextProductionNumber ?? 2);

  return {
    firstLotId: nextLotId - itemCount,
    documentNumber: nextDocumentNumber - 1,
    productionNumber: nextProductionNumber - 1,
  };
};

const productionDocumentSelect = {
  id: true,
  docId: true,
  productionNo: true,
  docType: true,
  docDate: true,
  status: true,
};

const purchaseDocumentSelect = {
  id: true,
  docId: true,
  purchaseNo: true,
  purchaseFrom: true,
  docType: true,
  docDate: true,
  status: true,
  paymentTerm: true,
  currency: true,
};

const memoDocumentSelect = {
  id: true,
  docId: true,
  memoNo: true,
  docType: true,
  docDate: true,
  status: true,
  paymentTerm: true,
  currency: true,
};

const inventoryItemInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
  itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
  purchaseNote: { select: purchaseDocumentSelect },
  purchaseReturn: { select: purchaseDocumentSelect },
  memo: { select: memoDocumentSelect },
  memoReturn: { select: memoDocumentSelect },
  returnedFromProduction: { select: productionDocumentSelect },
};

const productionDocumentInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  sourceInventoryItem: { include: inventoryItemInclude },
  sourceProduction: { select: productionDocumentSelect },
  returnedInventoryItems: {
    orderBy: { lotId: "asc" },
    include: inventoryItemInclude,
  },
};

const mapPurchaseDocument = (note) =>
  note
    ? {
        id: note.id,
        docId: note.docId,
        purchaseNo: note.purchaseNo,
        purchaseFrom: note.purchaseFrom,
        docType: note.docType,
        docDate: normalizeDate(note.docDate),
        status: note.status,
        paymentTerm: note.paymentTerm,
        currency: note.currency,
      }
    : null;

const mapMemoDocument = (memo) =>
  memo
    ? {
        id: memo.id,
        docId: memo.docId,
        memoNo: memo.memoNo,
        docType: memo.docType,
        docDate: normalizeDate(memo.docDate),
        status: memo.status,
        paymentTerm: memo.paymentTerm,
        currency: memo.currency,
      }
    : null;

const mapProductionDocumentLink = (document) =>
  document
    ? {
        id: document.id,
        docId: document.docId,
        productionNo: document.productionNo,
        docType: document.docType,
        docDate: normalizeDate(document.docDate),
        status: document.status,
      }
    : null;

const mapOriginDocument = ({ memo, purchase, production }) => {
  if (production) return { documentType: "PRODUCTION", ...production };
  if (memo) return { documentType: "MEMO", ...memo };
  if (purchase) return { documentType: "PURCHASE_NOTE", ...purchase };
  return null;
};

const mapInventoryItem = (item) => {
  if (!item) return null;

  const purchase = mapPurchaseDocument(item.purchaseNote);
  const memo = mapMemoDocument(item.memo);
  const memoReturn = mapMemoDocument(item.memoReturn);
  const purchaseReturn = mapPurchaseDocument(item.purchaseReturn);
  const returnedFromProduction = mapProductionDocumentLink(item.returnedFromProduction);

  return {
    id: item.id,
    itemId: item.itemId,
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
    rap: item.rap === null ? null : numberValue(item.rap),
    mainDiscount: item.mainDiscount === null ? null : numberValue(item.mainDiscount),
    totalDocPriceGross:
      item.totalDocPriceGross === null ? null : numberValue(item.totalDocPriceGross),
    remark: item.remark,
    departmentAccountName: item.departmentAccountName,
    locationAccountName: item.locationAccountName,
    status: item.status,
    createdAt: normalizeDate(item.createdAt),
    company: item.company,
    department: item.department,
    vendorAccount: item.vendorAccount,
    originDocument: mapOriginDocument({
      memo,
      purchase,
      production: returnedFromProduction,
    }),
    originMemo: memo,
    purchase,
    purchaseReturn,
    memoReturn,
    purchaseNote: purchase,
    memo,
    returnedFromProduction,
  };
};

const mapProductionDocument = (document) => ({
  id: document.id,
  docId: document.docId,
  productionNo: document.productionNo,
  docType: document.docType,
  openDate: normalizeDate(document.openDate),
  docDate: normalizeDate(document.docDate),
  referenceDocNo: document.referenceDocNo,
  notes: document.notes,
  processAccountName: document.processAccountName,
  fromLocationAccountName: document.fromLocationAccountName,
  toLocationAccountName: document.toLocationAccountName,
  expectedReturnDate: normalizeDate(document.expectedReturnDate),
  docQty: document.docQty,
  docWeight: numberValue(document.docWeight),
  returnedQty: document.returnedQty,
  returnedWeight: numberValue(document.returnedWeight),
  lossWeight: numberValue(document.lossWeight),
  docGrandTotalPrice: numberValue(document.docGrandTotalPrice),
  status: document.status,
  createdAt: normalizeDate(document.createdAt),
  company: document.company,
  department: document.department,
  createdBy: document.createdBy,
  sourceInventoryItem: mapInventoryItem(document.sourceInventoryItem),
  sourceProduction: mapProductionDocumentLink(document.sourceProduction),
  returnedInventoryItems: document.returnedInventoryItems?.map(mapInventoryItem) ?? [],
});

const itemTotals = (item) => ({
  qty: item.quantity,
  weight: numberValue(item.weight),
  totalCost: numberValue(item.totalCost),
});

const buildPartsTotals = (parts) =>
  parts.reduce(
    (sum, item) => ({
      qty: sum.qty + item.quantity,
      weight: sum.weight + numberValue(item.weight),
      totalCost: sum.totalCost + numberValue(item.totalCost),
    }),
    { qty: 0, weight: 0, totalCost: 0 },
  );

const resolveStockProductionItem = async ({ companyId, inventoryItemId }) =>
  prisma.inventoryItem.findFirst({
    where: {
      id: inventoryItemId,
      companyId,
      status: "STOCK",
      ...productionStockOriginWhere,
    },
    include: inventoryItemInclude,
  });

const ensureCompanyAccess = async ({ req, companyId }) =>
  userCanAccessCompany({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
  });

const ensureDepartmentWrite = async ({ req, departmentId, module }) =>
  userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId,
    module,
    access: "READ_WRITE",
  });

const createInventoryMovement = async ({
  tx,
  item,
  event,
  fromStatus,
  toStatus,
  document,
  departmentId,
  userId,
  metadata,
}) =>
  tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      event,
      fromStatus,
      toStatus,
      documentType: "PRODUCTION",
      documentId: document.id,
      documentNo: document.productionNo,
      docId: document.docId,
      companyId: item.companyId,
      departmentId: departmentId ?? item.departmentId,
      createdById: userId,
      metadata: metadata ?? undefined,
    },
  });

const resolveItemMasters = async ({ companyId, parts }) => {
  const itemMasterIds = [
    ...new Set(parts.map((part) => part.itemMasterId).filter(Boolean)),
  ];

  if (itemMasterIds.length === 0) return new Map();

  const itemMasters = await prisma.itemMaster.findMany({
    where: {
      id: { in: itemMasterIds },
      companyId,
    },
    select: {
      id: true,
      itemId: true,
      itemName: true,
      itemType: true,
      uow: true,
      uom: true,
    },
  });

  if (itemMasters.length !== itemMasterIds.length) return null;
  return new Map(itemMasters.map((item) => [item.id, item]));
};

const buildReturnedPartRows = ({
  parts,
  sourceItem,
  itemMasters,
  sequence,
  document,
  returnLocationAccountName,
  userId,
}) =>
  parts.map((part, index) => {
    const lotId = sequence.firstLotId + index;
    const itemMaster = part.itemMasterId
      ? itemMasters.get(part.itemMasterId)
      : sourceItem.itemMaster;

    return {
      itemId: buildItemId(sourceItem.company, lotId),
      lotId,
      itemMasterId: itemMaster?.id ?? null,
      itemType: itemMaster?.itemType ?? sourceItem.itemType,
      lotName: part.lotName,
      quantity: part.quantity,
      weight: part.weight,
      totalCost: part.totalCost,
      labAccountName: part.labAccountName ?? sourceItem.labAccountName,
      certificateNo: part.certificateNo ?? sourceItem.certificateNo,
      parcelOrStone: part.parcelOrStone ?? sourceItem.parcelOrStone,
      shape: part.shape ?? sourceItem.shape ?? null,
      color: part.color ?? sourceItem.color ?? null,
      clarity: part.clarity ?? sourceItem.clarity ?? null,
      rap: part.rap ?? sourceItem.rap ?? null,
      mainDiscount: part.mainDiscount ?? sourceItem.mainDiscount ?? null,
      docPriceGross: sourceItem.docPriceGross ?? null,
      totalDocPriceGross: part.totalCost,
      remark: part.remark ?? null,
      departmentAccountName: sourceItem.department.name,
      locationAccountName: returnLocationAccountName,
      status: "STOCK",
      vendorAccountId: sourceItem.vendorAccountId,
      companyId: sourceItem.companyId,
      departmentId: sourceItem.departmentId,
      returnedFromProductionId: document.id,
      createdById: userId,
    };
  });

export const getProductionInventoryItemByLot = async (req, res) => {
  const companyId = String(req.query.companyId ?? "").trim();
  const lotId = Number(req.params.lotId);

  if (!companyId) return sendError(res, "companyId is required", 400);
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return sendError(res, "Valid lotId is required", 400);
  }

  const departmentIds = await getAccessibleDepartmentIdsForAnyModule({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
    checks: productionAccessChecks,
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Production access denied for this company", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      companyId,
      departmentId: { in: departmentIds },
      lotId,
      status: "STOCK",
      ...productionStockOriginWhere,
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Available stock item not found for this Lot ID", 404);
  }

  return sendSuccess(res, "Production stock item retrieved successfully", {
    inventoryItem: mapInventoryItem(inventoryItem),
  });
};

export const changeInventoryLocation = async (req, res) => {
  const result = changeLocationSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  if (!(await ensureCompanyAccess({ req, companyId: data.companyId }))) {
    return sendError(res, "Company access denied", 403);
  }

  const inventoryItem = await resolveStockProductionItem({
    companyId: data.companyId,
    inventoryItemId: data.inventoryItemId,
  });

  if (!inventoryItem) {
    return sendError(res, "Only available stock items can change location", 400);
  }

  if (
    !(await ensureDepartmentWrite({
      req,
      departmentId: inventoryItem.departmentId,
      module: "CHANGE_LOCATION",
    }))
  ) {
    return sendError(res, "You do not have change location access for this item department", 403);
  }

  if (inventoryItem.locationAccountName === data.toLocationAccountName) {
    return sendError(res, "Select a different location", 400, {
      toLocationAccountName: ["Select a different location"],
    });
  }

  try {
    const productionDocument = await prisma.$transaction(async (tx) => {
      const sequence = await reserveProductionSequence({
        tx,
        companyId: data.companyId,
      });
      const productionNo = buildProductionNo(
        inventoryItem.company,
        sequence.productionNumber,
      );
      const totals = itemTotals(inventoryItem);

      const document = await tx.productionDocument.create({
        data: {
          docId: sequence.documentNumber,
          productionNo,
          docType: "Change Location",
          docDate: parseDate(data.docDate),
          referenceDocNo: data.referenceDocNo ?? null,
          notes: data.notes ?? null,
          fromLocationAccountName: inventoryItem.locationAccountName,
          toLocationAccountName: data.toLocationAccountName,
          docQty: totals.qty,
          docWeight: totals.weight,
          returnedQty: totals.qty,
          returnedWeight: totals.weight,
          docGrandTotalPrice: totals.totalCost,
          status: "CLOSED",
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          sourceInventoryItemId: inventoryItem.id,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          status: "STOCK",
          ...productionStockOriginWhere,
        },
        data: {
          locationAccountName: data.toLocationAccountName,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await createInventoryMovement({
        tx,
        item: inventoryItem,
        event: "CHANGE_LOCATION",
        fromStatus: "STOCK",
        toStatus: "STOCK",
        document,
        userId: req.user.userId,
        metadata: {
          fromLocationAccountName: inventoryItem.locationAccountName,
          toLocationAccountName: data.toLocationAccountName,
          lotId: inventoryItem.lotId,
        },
      });

      return tx.productionDocument.findUnique({
        where: { id: document.id },
        include: productionDocumentInclude,
      });
    });

    return sendSuccess(
      res,
      "Location changed successfully",
      { productionDocument: mapProductionDocument(productionDocument) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected item changed before location was updated. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const sendInventoryToProcess = async (req, res) => {
  const result = sendToProcessSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  if (!(await ensureCompanyAccess({ req, companyId: data.companyId }))) {
    return sendError(res, "Company access denied", 403);
  }

  const inventoryItem = await resolveStockProductionItem({
    companyId: data.companyId,
    inventoryItemId: data.inventoryItemId,
  });

  if (!inventoryItem) {
    return sendError(res, "Only available stock items can be sent to process", 400);
  }

  if (
    !(await ensureDepartmentWrite({
      req,
      departmentId: inventoryItem.departmentId,
      module: "SEND_TO_PROCESS",
    }))
  ) {
    return sendError(res, "You do not have send to process access for this item department", 403);
  }

  try {
    const productionDocument = await prisma.$transaction(async (tx) => {
      const sequence = await reserveProductionSequence({
        tx,
        companyId: data.companyId,
      });
      const productionNo = buildProductionNo(
        inventoryItem.company,
        sequence.productionNumber,
      );
      const totals = itemTotals(inventoryItem);

      const document = await tx.productionDocument.create({
        data: {
          docId: sequence.documentNumber,
          productionNo,
          docType: "Send To Process",
          docDate: parseDate(data.docDate),
          referenceDocNo: data.referenceDocNo ?? null,
          notes: data.notes ?? null,
          processAccountName: data.processAccountName,
          fromLocationAccountName: inventoryItem.locationAccountName,
          toLocationAccountName: data.processAccountName,
          expectedReturnDate: data.expectedReturnDate ? parseDate(data.expectedReturnDate) : null,
          docQty: totals.qty,
          docWeight: totals.weight,
          docGrandTotalPrice: totals.totalCost,
          status: "OPEN",
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          sourceInventoryItemId: inventoryItem.id,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          status: "STOCK",
          ...productionStockOriginWhere,
        },
        data: {
          status: "IN_PROCESS",
          locationAccountName: data.processAccountName,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await createInventoryMovement({
        tx,
        item: inventoryItem,
        event: "SEND_TO_PROCESS",
        fromStatus: "STOCK",
        toStatus: "IN_PROCESS",
        document,
        userId: req.user.userId,
        metadata: {
          processAccountName: data.processAccountName,
          fromLocationAccountName: inventoryItem.locationAccountName,
          lotId: inventoryItem.lotId,
        },
      });

      return tx.productionDocument.findUnique({
        where: { id: document.id },
        include: productionDocumentInclude,
      });
    });

    return sendSuccess(
      res,
      "Item sent to process successfully",
      { productionDocument: mapProductionDocument(productionDocument) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected item changed before it was sent to process. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getProductionReturnItemByLot = async (req, res) => {
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
    module: "RETURN_PARTS",
    access: "READ_WRITE",
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Return parts access denied for this company", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      companyId,
      departmentId: { in: departmentIds },
      lotId,
      status: "IN_PROCESS",
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "In-process item not found for this Lot ID", 404);
  }

  const sourceProduction = await prisma.productionDocument.findFirst({
    where: {
      companyId,
      sourceInventoryItemId: inventoryItem.id,
      docType: "Send To Process",
      status: "OPEN",
    },
    orderBy: { createdAt: "desc" },
    include: productionDocumentInclude,
  });

  if (!sourceProduction) {
    return sendError(res, "Open process document not found for this Lot ID", 404);
  }

  return sendSuccess(res, "Production return item retrieved successfully", {
    productionReturnItem: {
      inventoryItem: mapInventoryItem(inventoryItem),
      sourceProduction: mapProductionDocument(sourceProduction),
    },
  });
};

export const returnProductionParts = async (req, res) => {
  const result = returnPartsSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  if (!(await ensureCompanyAccess({ req, companyId: data.companyId }))) {
    return sendError(res, "Company access denied", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      companyId: data.companyId,
      status: "IN_PROCESS",
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Only in-process items can return parts", 400);
  }

  if (
    !(await ensureDepartmentWrite({
      req,
      departmentId: inventoryItem.departmentId,
      module: "RETURN_PARTS",
    }))
  ) {
    return sendError(res, "You do not have return parts access for this item department", 403);
  }

  const sourceProduction = await prisma.productionDocument.findFirst({
    where: {
      id: data.sourceProductionId,
      companyId: data.companyId,
      sourceInventoryItemId: inventoryItem.id,
      docType: "Send To Process",
      status: "OPEN",
    },
    include: productionDocumentInclude,
  });

  if (!sourceProduction) {
    return sendError(res, "Open process document not found for selected item", 404);
  }

  const itemMasters = await resolveItemMasters({
    companyId: data.companyId,
    parts: data.parts,
  });
  if (!itemMasters) {
    return sendError(res, "Item not found for selected company", 404, {
      itemMasterId: ["Select a valid item"],
    });
  }

  const totals = buildPartsTotals(data.parts);
  const lossWeight = numberValue(data.lossWeight);
  const sourceWeight = numberValue(inventoryItem.weight);

  if (totals.weight + lossWeight > sourceWeight + 0.0001) {
    return sendError(res, "Returned weight plus loss cannot exceed process weight", 400, {
      weight: ["Returned weight plus loss cannot exceed process weight"],
    });
  }

  const referenceDocNo = data.referenceDocNo
    ? `${data.referenceDocNo} | Return Parts: ${sourceProduction.productionNo}`
    : `Return Parts: ${sourceProduction.productionNo}`;

  try {
    const productionDocument = await prisma.$transaction(async (tx) => {
      const sequence = await reserveProductionSequence({
        tx,
        companyId: data.companyId,
        itemCount: data.parts.length,
      });
      const productionNo = buildProductionNo(
        inventoryItem.company,
        sequence.productionNumber,
      );

      const document = await tx.productionDocument.create({
        data: {
          docId: sequence.documentNumber,
          productionNo,
          docType: "Return Parts",
          docDate: parseDate(data.docDate),
          referenceDocNo,
          notes: data.notes ?? null,
          processAccountName: sourceProduction.processAccountName,
          fromLocationAccountName: inventoryItem.locationAccountName,
          toLocationAccountName: data.returnLocationAccountName,
          docQty: inventoryItem.quantity,
          docWeight: inventoryItem.weight,
          returnedQty: totals.qty,
          returnedWeight: totals.weight,
          lossWeight,
          docGrandTotalPrice: totals.totalCost,
          status: "CLOSED",
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          sourceInventoryItemId: inventoryItem.id,
          sourceProductionId: sourceProduction.id,
          createdById: req.user.userId,
        },
      });

      await tx.inventoryItem.createMany({
        data: buildReturnedPartRows({
          parts: data.parts,
          sourceItem: inventoryItem,
          itemMasters,
          sequence,
          document,
          returnLocationAccountName: data.returnLocationAccountName,
          userId: req.user.userId,
        }),
      });

      const returnedItems = await tx.inventoryItem.findMany({
        where: { returnedFromProductionId: document.id },
        select: {
          id: true,
          companyId: true,
          departmentId: true,
          status: true,
          lotId: true,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          status: "IN_PROCESS",
        },
        data: {
          status: "PROCESSED",
          locationAccountName: data.returnLocationAccountName,
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await tx.productionDocument.update({
        where: { id: sourceProduction.id },
        data: {
          status: "CLOSED",
          returnedQty: totals.qty,
          returnedWeight: totals.weight,
          lossWeight,
          toLocationAccountName: data.returnLocationAccountName,
        },
      });

      await createInventoryMovement({
        tx,
        item: inventoryItem,
        event: "RETURN_PARTS",
        fromStatus: "IN_PROCESS",
        toStatus: "PROCESSED",
        document,
        userId: req.user.userId,
        metadata: {
          sourceProductionId: sourceProduction.id,
          sourceProductionNo: sourceProduction.productionNo,
          returnedWeight: totals.weight,
          lossWeight,
          returnLocationAccountName: data.returnLocationAccountName,
          lotId: inventoryItem.lotId,
        },
      });

      await tx.inventoryMovement.createMany({
        data: returnedItems.map((item) => ({
          inventoryItemId: item.id,
          event: "RETURN_PARTS",
          fromStatus: null,
          toStatus: "STOCK",
          documentType: "PRODUCTION",
          documentId: document.id,
          documentNo: document.productionNo,
          docId: document.docId,
          companyId: item.companyId,
          departmentId: item.departmentId,
          createdById: req.user.userId,
          metadata: {
            sourceInventoryItemId: inventoryItem.id,
            sourceLotId: inventoryItem.lotId,
            sourceProductionId: sourceProduction.id,
            sourceProductionNo: sourceProduction.productionNo,
            returnedLotId: item.lotId,
          },
        })),
      });

      return tx.productionDocument.findUnique({
        where: { id: document.id },
        include: productionDocumentInclude,
      });
    });

    return sendSuccess(
      res,
      "Production parts returned successfully",
      { productionDocument: mapProductionDocument(productionDocument) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected in-process item changed before parts were returned. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getProductionDocuments = async (req, res) => {
  const { companyId, departmentId, search, docType } = req.query;
  const where = {};

  if (departmentId) {
    const canRead = await userHasDepartmentModuleAccess({
      userId: req.user.userId,
      userRole: req.user.role,
      departmentId: String(departmentId),
      module: "INVENTORY_LIST",
      access: "READ_ONLY",
    });

    if (!canRead) return sendError(res, "Production document access denied", 403);
    where.departmentId = String(departmentId);
  } else {
    if (!companyId) return sendError(res, "companyId or departmentId is required", 400);

    const departmentIds = await getAccessibleDepartmentIdsForAnyModule({
      userId: req.user.userId,
      userRole: req.user.role,
      companyId: String(companyId),
      checks: [
        { module: "INVENTORY_LIST", access: "READ_ONLY" },
        ...productionAccessChecks,
      ],
    });

    if (departmentIds.length === 0) {
      return sendError(res, "Production document access denied for this company", 403);
    }

    where.companyId = String(companyId);
    where.departmentId = { in: departmentIds };
  }

  const docTypeValue = String(docType ?? "").trim();
  if (docTypeValue) where.docType = docTypeValue;

  const searchValue = String(search ?? "").trim();
  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue) ? { docId: Number(searchValue) } : undefined,
      /^\d+$/.test(searchValue)
        ? { sourceInventoryItem: { lotId: Number(searchValue) } }
        : undefined,
      { productionNo: { contains: searchValue, mode: "insensitive" } },
      { docType: { contains: searchValue, mode: "insensitive" } },
      { referenceDocNo: { contains: searchValue, mode: "insensitive" } },
      { processAccountName: { contains: searchValue, mode: "insensitive" } },
      { fromLocationAccountName: { contains: searchValue, mode: "insensitive" } },
      { toLocationAccountName: { contains: searchValue, mode: "insensitive" } },
      { sourceInventoryItem: { itemId: { contains: searchValue, mode: "insensitive" } } },
      { sourceInventoryItem: { lotName: { contains: searchValue, mode: "insensitive" } } },
      { sourceInventoryItem: { certificateNo: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);
  }

  const productionDocuments = await prisma.productionDocument.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: productionDocumentInclude,
  });

  return sendSuccess(res, "Production documents retrieved successfully", {
    productionDocuments: productionDocuments.map(mapProductionDocument),
  });
};
