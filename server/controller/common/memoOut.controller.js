import { z } from "zod";

import {
  getAccessibleDepartmentIds,
  getAccessibleDepartmentIdsForAnyModule,
  userCanAccessCompany,
  userHasDepartmentModuleAccess,
} from "../../helper/departmentAccess.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const MEMO_STATUS = ["ACTIVE", "CANCELLED"];
const MEMO_OUT_ACCOUNT_TYPES = ["vendor", "customer", "group customer"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const docDateSchema = z.preprocess(emptyToUndefined, z.string().trim().optional());

const paymentTermSchema = () =>
  z
    .preprocess(
      (value) => {
        if (value === null || value === undefined) return null;
        if (typeof value === "string" && value.trim() === "") return null;
        return value;
      },
      z.coerce.number().int().min(1).max(15).nullable().optional(),
    )
    .transform((value) => value ?? null);

const memoOutPayloadSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  accountId: z.string({ required_error: "Select a vendor or customer" }).uuid("Invalid account"),
  inventoryItemId: z.string({ required_error: "Select an inventory item" }).uuid("Invalid inventory item"),
  referenceDocNo: optionalString(),
  paymentTerm: paymentTermSchema(),
  currency: z.preprocess(
    emptyToUndefined,
    z.string().trim().length(3, "Currency must be a 3-letter code").toUpperCase().optional(),
  ),
  docDate: docDateSchema,
  status: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(MEMO_STATUS).optional().default("ACTIVE"),
  ),
});

const memoOutReturnPayloadSchema = z.object({
  companyId: z.string({ required_error: "companyId is required" }).uuid("Invalid company"),
  accountId: z.string({ required_error: "Select a vendor or customer" }).uuid("Invalid account"),
  inventoryItemId: z.string({ required_error: "inventoryItemId is required" }).uuid("Invalid inventory item"),
  referenceDocNo: optionalString(),
  docDate: docDateSchema,
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
  (company.code || company.name || "MO")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "MO";

const buildMemoOutNo = (company, number) =>
  `${buildPrefix(company)}-MO-${String(number).padStart(6, "0")}`;

const memoOutStockOriginWhere = {
  OR: [
    { purchaseNoteId: { not: null } },
    { returnedFromProductionId: { not: null } },
  ],
};

const memoOutAccessChecks = [
  { module: "MEMO_OUT_LIST", access: "READ_ONLY" },
  { module: "NEW_MEMO_OUT", access: "READ_WRITE" },
  { module: "NEW_MEMO_OUT_RETURN", access: "READ_WRITE" },
];

const reserveMemoOutSequence = async ({ tx, companyId }) => {
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
    VALUES (${companyId}, 1, 2, 1, 2, 1, 1, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextMemoNumber" = "InventorySequence"."nextMemoNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextDocumentNumber", "nextMemoNumber";
  `;

  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextMemoNumber = Number(rows[0]?.nextMemoNumber ?? 2);

  return {
    documentNumber: nextDocumentNumber - 1,
    memoOutNumber: nextMemoNumber - 1,
  };
};

const accountSelect = {
  id: true,
  accountName: true,
  accountLongName: true,
  accountIndex: true,
  address: true,
  address2: true,
  countryIso2: true,
  city: true,
  zipCode: true,
  phone1: true,
  phone2: true,
  email: true,
  website: true,
  trnNo: true,
  companyId: true,
  state: { select: { id: true, name: true, code: true } },
  accountType: { select: { id: true, name: true } },
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
};

const memoOutInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  account: { select: accountSelect },
  inventoryItem: { include: inventoryItemInclude },
  sourceMemoOut: {
    select: {
      id: true,
      docId: true,
      memoNo: true,
      docType: true,
      docDate: true,
      status: true,
    },
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

const mapOriginDocument = ({ memo, purchase }) => {
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

  return {
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
    originDocument: mapOriginDocument({ memo, purchase }),
    originMemo: memo,
    purchase,
    purchaseReturn,
    memoReturn,
    purchaseNote: purchase,
    memo,
  };
};

const mapMemoOutLink = (memoOut) =>
  memoOut
    ? {
        id: memoOut.id,
        docId: memoOut.docId,
        memoNo: memoOut.memoNo,
        docType: memoOut.docType,
        docDate: normalizeDate(memoOut.docDate),
        status: memoOut.status,
      }
    : null;

const mapMemoOut = (memoOut) => {
  const item = mapInventoryItem(memoOut.inventoryItem);

  return {
    id: memoOut.id,
    docId: item?.docId ?? memoOut.docId,
    memoNo: memoOut.memoNo,
    docType: memoOut.docType,
    openDate: normalizeDate(memoOut.openDate),
    docDate: normalizeDate(memoOut.docDate),
    referenceDocNo: memoOut.referenceDocNo,
    itemType: memoOut.itemType,
    docQty: memoOut.docQty,
    docWeight: numberValue(memoOut.docWeight),
    docGrandTotalPrice: numberValue(memoOut.docGrandTotalPrice),
    mainGrandTotalPrice: numberValue(memoOut.mainGrandTotalPrice),
    balanceAmount: numberValue(memoOut.balanceAmount),
    paymentTerm: memoOut.paymentTerm,
    currency: memoOut.currency,
    docRateToMain: numberValue(memoOut.docRateToMain),
    docRateToSec: numberValue(memoOut.docRateToSec),
    status: memoOut.status,
    createdAt: normalizeDate(memoOut.createdAt),
    company: memoOut.company,
    department: memoOut.department,
    createdBy: memoOut.createdBy,
    account: memoOut.account,
    inventoryItem: item,
    items: item ? [item] : [],
    sourceMemoOut: mapMemoOutLink(memoOut.sourceMemoOut),
  };
};

const resolveMemoOutAccount = async ({ accountId, companyId }) => {
  const account = await prisma.account.findFirst({
    where: {
      id: accountId,
      companyId,
      status: "ACTIVE",
      OR: MEMO_OUT_ACCOUNT_TYPES.map((name) => ({
        accountType: {
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
      })),
    },
    select: accountSelect,
  });

  return account;
};

const stockCurrency = (item) =>
  item.purchaseNote?.currency ?? item.memo?.currency ?? "USD";

const itemTotals = (item) => ({
  qty: item.quantity,
  weight: numberValue(item.weight),
  totalPrice: numberValue(item.totalCost),
});

const createInventoryMovement = async ({
  tx,
  item,
  event,
  fromStatus,
  toStatus,
  document,
  userId,
  metadata,
}) =>
  tx.inventoryMovement.create({
    data: {
      inventoryItemId: item.id,
      event,
      fromStatus,
      toStatus,
      documentType: "MEMO_OUT",
      documentId: document.id,
      documentNo: document.memoNo,
      docId: item.docId ?? document.docId,
      companyId: item.companyId,
      departmentId: item.departmentId,
      createdById: userId,
      metadata: metadata ?? undefined,
    },
  });

const resolveMemoOutReadScope = async (req) => {
  const departmentId = String(req.query.departmentId ?? "").trim();
  const companyId = String(req.query.companyId ?? "").trim();

  if (departmentId) {
    const canRead = await userHasDepartmentModuleAccess({
      userId: req.user.userId,
      userRole: req.user.role,
      departmentId,
      module: "MEMO_OUT_LIST",
      access: "READ_ONLY",
    });

    return canRead
      ? { where: { departmentId } }
      : { error: ["Memo Out list access denied", 403] };
  }

  if (!companyId) {
    return { error: ["companyId or departmentId is required", 400] };
  }

  const departmentIds = await getAccessibleDepartmentIds({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
    module: "MEMO_OUT_LIST",
    access: "READ_ONLY",
  });

  if (departmentIds.length === 0) {
    return { error: ["Memo Out list access denied for this company", 403] };
  }

  return { where: { companyId } };
};

export const getMemoOutAccounts = async (req, res) => {
  const companyId = String(req.query.companyId ?? "").trim();
  if (!companyId) return sendError(res, "companyId is required", 400);

  const departmentIds = await getAccessibleDepartmentIdsForAnyModule({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
    checks: memoOutAccessChecks,
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Memo Out access denied for this company", 403);
  }

  const accounts = await prisma.account.findMany({
    where: {
      companyId,
      status: "ACTIVE",
      OR: MEMO_OUT_ACCOUNT_TYPES.map((name) => ({
        accountType: {
          name: {
            equals: name,
            mode: "insensitive",
          },
        },
      })),
    },
    orderBy: { accountName: "asc" },
    select: accountSelect,
  });

  return sendSuccess(res, "Memo Out accounts retrieved successfully", { accounts });
};

export const getMemoOutInventoryItemByLot = async (req, res) => {
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
    module: "NEW_MEMO_OUT",
    access: "READ_WRITE",
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Memo Out write access denied for this company", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      companyId,
      departmentId: { in: departmentIds },
      lotId,
      status: "STOCK",
      ...memoOutStockOriginWhere,
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Available inventory item not found for this Lot ID", 404);
  }

  return sendSuccess(res, "Memo Out inventory item retrieved successfully", {
    inventoryItem: mapInventoryItem(inventoryItem),
  });
};

export const createMemoOut = async (req, res) => {
  const result = memoOutPayloadSchema.safeParse(req.body);
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

  const account = await resolveMemoOutAccount({
    accountId: data.accountId,
    companyId: data.companyId,
  });
  if (!account) {
    return sendError(res, "Vendor or customer account not found for selected company", 404);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      companyId: data.companyId,
      status: "STOCK",
      ...memoOutStockOriginWhere,
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Available inventory item not found", 404);
  }

  const canMemoOut = await userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId: inventoryItem.departmentId,
    module: "NEW_MEMO_OUT",
    access: "READ_WRITE",
  });

  if (!canMemoOut) {
    return sendError(res, "You do not have Memo Out write access for this item department", 403);
  }

  const totals = itemTotals(inventoryItem);

  try {
    const memoOut = await prisma.$transaction(async (tx) => {
      const sequence = await reserveMemoOutSequence({
        tx,
        companyId: data.companyId,
      });
      const memoNo = buildMemoOutNo(inventoryItem.company, sequence.memoOutNumber);

      const created = await tx.memoOut.create({
        data: {
          docId: sequence.documentNumber,
          memoNo,
          docType: "Memo Out",
          docDate: parseDate(data.docDate),
          referenceDocNo: data.referenceDocNo ?? null,
          itemType: inventoryItem.itemType ?? null,
          docQty: totals.qty,
          docWeight: totals.weight,
          docGrandTotalPrice: totals.totalPrice,
          mainGrandTotalPrice: totals.totalPrice,
          balanceAmount: totals.totalPrice,
          paymentTerm: data.paymentTerm,
          currency: data.currency ?? stockCurrency(inventoryItem),
          status: data.status,
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          accountId: account.id,
          inventoryItemId: inventoryItem.id,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          status: "STOCK",
          ...memoOutStockOriginWhere,
        },
        data: {
          status: "MEMO_OUT",
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await createInventoryMovement({
        tx,
        item: inventoryItem,
        event: "MEMO_OUT",
        fromStatus: "STOCK",
        toStatus: "MEMO_OUT",
        document: created,
        userId: req.user.userId,
        metadata: {
          accountId: account.id,
          accountName: account.accountName,
          accountType: account.accountType?.name ?? null,
          lotId: inventoryItem.lotId,
        },
      });

      return tx.memoOut.findUnique({
        where: { id: created.id },
        include: memoOutInclude,
      });
    });

    return sendSuccess(
      res,
      "Memo Out created successfully",
      { memoOut: mapMemoOut(memoOut) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected inventory item changed before Memo Out was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getMemoOutReturnItemByLot = async (req, res) => {
  const companyId = String(req.query.companyId ?? "").trim();
  const accountId = String(req.query.accountId ?? "").trim();
  const lotId = Number(req.params.lotId);

  if (!companyId) return sendError(res, "companyId is required", 400);
  if (!accountId) return sendError(res, "accountId is required", 400);
  if (!Number.isInteger(lotId) || lotId <= 0) {
    return sendError(res, "Valid lotId is required", 400);
  }

  const account = await resolveMemoOutAccount({ accountId, companyId });
  if (!account) {
    return sendError(res, "Vendor or customer account not found for selected company", 404);
  }

  const departmentIds = await getAccessibleDepartmentIds({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
    module: "NEW_MEMO_OUT_RETURN",
    access: "READ_WRITE",
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Memo Out return access denied for this company", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      companyId,
      departmentId: { in: departmentIds },
      lotId,
      status: "MEMO_OUT",
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Memo Out item not found for this Lot ID", 404);
  }

  const memoOut = await prisma.memoOut.findFirst({
    where: {
      companyId,
      inventoryItemId: inventoryItem.id,
      docType: "Memo Out",
    },
    orderBy: { createdAt: "desc" },
    include: memoOutInclude,
  });

  if (!memoOut) {
    return sendError(res, "No Memo Out document found for this Lot ID", 404);
  }

  if (memoOut.accountId !== account.id) {
    return sendError(res, "This Lot ID is memoed out to a different vendor or customer", 400);
  }

  return sendSuccess(res, "Memo Out return item retrieved successfully", {
    memoOutReturnItem: {
      inventoryItem: mapInventoryItem(inventoryItem),
      memoOut: mapMemoOut(memoOut),
    },
  });
};

export const returnMemoOutItem = async (req, res) => {
  const result = memoOutReturnPayloadSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;

  const account = await resolveMemoOutAccount({
    accountId: data.accountId,
    companyId: data.companyId,
  });
  if (!account) {
    return sendError(res, "Vendor or customer account not found for selected company", 404);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      companyId: data.companyId,
      status: "MEMO_OUT",
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Memo Out item not found", 404);
  }

  const sourceMemoOut = await prisma.memoOut.findFirst({
    where: {
      companyId: data.companyId,
      inventoryItemId: inventoryItem.id,
      docType: "Memo Out",
    },
    orderBy: { createdAt: "desc" },
    include: memoOutInclude,
  });

  if (!sourceMemoOut) {
    return sendError(res, "No Memo Out document found for selected item", 404);
  }

  if (sourceMemoOut.accountId !== account.id) {
    return sendError(res, "Selected item is memoed out to a different vendor or customer", 400);
  }

  const canReturn = await userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId: inventoryItem.departmentId,
    module: "NEW_MEMO_OUT_RETURN",
    access: "READ_WRITE",
  });

  if (!canReturn) {
    return sendError(res, "You do not have Memo Out return access for this item department", 403);
  }

  const totals = itemTotals(inventoryItem);
  const referenceDocNo = data.referenceDocNo
    ? `${data.referenceDocNo} | Memo Out Return: ${sourceMemoOut.memoNo}`
    : `Memo Out Return: ${sourceMemoOut.memoNo}`;

  try {
    const memoOutReturn = await prisma.$transaction(async (tx) => {
      const sequence = await reserveMemoOutSequence({
        tx,
        companyId: data.companyId,
      });
      const memoNo = buildMemoOutNo(inventoryItem.company, sequence.memoOutNumber);

      const created = await tx.memoOut.create({
        data: {
          docId: sequence.documentNumber,
          memoNo,
          docType: "Memo Out Return",
          docDate: parseDate(data.docDate),
          referenceDocNo,
          itemType: inventoryItem.itemType ?? null,
          docQty: totals.qty,
          docWeight: totals.weight,
          docGrandTotalPrice: totals.totalPrice,
          mainGrandTotalPrice: totals.totalPrice,
          balanceAmount: 0,
          paymentTerm: sourceMemoOut.paymentTerm,
          currency: sourceMemoOut.currency ?? stockCurrency(inventoryItem),
          status: "ACTIVE",
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          accountId: account.id,
          inventoryItemId: inventoryItem.id,
          sourceMemoOutId: sourceMemoOut.id,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          status: "MEMO_OUT",
        },
        data: {
          status: "STOCK",
        },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await createInventoryMovement({
        tx,
        item: inventoryItem,
        event: "MEMO_OUT_RETURN",
        fromStatus: "MEMO_OUT",
        toStatus: "STOCK",
        document: created,
        userId: req.user.userId,
        metadata: {
          accountId: account.id,
          accountName: account.accountName,
          accountType: account.accountType?.name ?? null,
          sourceMemoOutId: sourceMemoOut.id,
          sourceMemoOutNo: sourceMemoOut.memoNo,
          lotId: inventoryItem.lotId,
        },
      });

      return tx.memoOut.findUnique({
        where: { id: created.id },
        include: memoOutInclude,
      });
    });

    return sendSuccess(
      res,
      "Memo Out return created successfully",
      { memoOut: mapMemoOut(memoOutReturn) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected Memo Out item changed before return was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getMemoOuts = async (req, res) => {
  const { search, docType } = req.query;
  const scope = await resolveMemoOutReadScope(req);

  if (scope.error) {
    return sendError(res, scope.error[0], scope.error[1]);
  }

  const where = { ...scope.where };
  const docTypeValue = String(docType ?? "").trim();
  const searchValue = String(search ?? "").trim();

  if (docTypeValue) {
    where.docType = docTypeValue;
  }

  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue) ? { docId: Number(searchValue) } : undefined,
      /^\d+$/.test(searchValue)
        ? { inventoryItem: { docId: Number(searchValue) } }
        : undefined,
      /^\d+$/.test(searchValue)
        ? { inventoryItem: { lotId: Number(searchValue) } }
        : undefined,
      { memoNo: { contains: searchValue, mode: "insensitive" } },
      { docType: { contains: searchValue, mode: "insensitive" } },
      { referenceDocNo: { contains: searchValue, mode: "insensitive" } },
      { department: { name: { contains: searchValue, mode: "insensitive" } } },
      { createdBy: { fullName: { contains: searchValue, mode: "insensitive" } } },
      { createdBy: { email: { contains: searchValue, mode: "insensitive" } } },
      { account: { accountName: { contains: searchValue, mode: "insensitive" } } },
      { account: { accountIndex: { contains: searchValue, mode: "insensitive" } } },
      { inventoryItem: { itemId: { contains: searchValue, mode: "insensitive" } } },
      { inventoryItem: { lotName: { contains: searchValue, mode: "insensitive" } } },
      { inventoryItem: { certificateNo: { contains: searchValue, mode: "insensitive" } } },
      { inventoryItem: { itemMaster: { itemName: { contains: searchValue, mode: "insensitive" } } } },
    ].filter(Boolean);
  }

  const memoOuts = await prisma.memoOut.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: memoOutInclude,
  });

  return sendSuccess(res, "Memo Out documents retrieved successfully", {
    memoOuts: memoOuts.map(mapMemoOut),
  });
};

export const getMemoOut = async (req, res) => {
  const { id } = req.params;
  const scope = await resolveMemoOutReadScope(req);

  if (scope.error) {
    return sendError(res, scope.error[0], scope.error[1]);
  }

  const memoOut = await prisma.memoOut.findFirst({
    where: { id, ...scope.where },
    include: memoOutInclude,
  });

  if (!memoOut) return sendError(res, "Memo Out document not found", 404);

  return sendSuccess(res, "Memo Out document retrieved successfully", {
    memoOut: mapMemoOut(memoOut),
  });
};
