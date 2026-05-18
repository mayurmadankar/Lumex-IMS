import { z } from "zod";

import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const PARCEL_OR_STONE = ["PARCEL", "STONE"];
const MEMO_STATUS = ["ACTIVE", "CANCELLED"];
const PURCHASE_STATUS = ["ACTIVE", "CANCELLED"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalDecimal = () =>
  z.preprocess(emptyToUndefined, z.coerce.number().optional());

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

const numericString = (fieldName) =>
  z.preprocess(
    (value) => String(value ?? "").trim(),
    z.string().regex(/^\d+$/, `${fieldName} must be a number`),
  );

const memoItemSchema = z.object({
  itemMasterId: z.string({ required_error: "Select an item" }).uuid("Select an item"),
  lotName: z.string({ required_error: "Lot name is required" }).trim().min(1, "Lot name is required"),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0"),
  weight: z.coerce.number().positive("Weight must be greater than 0"),
  shape: optionalString(),
  color: optionalString(),
  clarity: optionalString(),
  labAccountName: optionalString(),
  certificateNo: numericString("Certificate no."),
  rap: optionalDecimal(),
  mainDiscount: optionalDecimal(),
  totalCost: z.coerce.number().positive("Total cost must be greater than 0"),
  remark: optionalString(),
  parcelOrStone: z.enum(PARCEL_OR_STONE).optional().default("STONE"),
});

const memoPayloadSchema = z.object({
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
  accountId: z.string({ required_error: "accountId is required" }).uuid("Invalid account"),
  referenceDocNo: optionalString(),
  itemType: optionalString(),
  paymentTerm: paymentTermSchema(),
  currency: z.preprocess(emptyToUndefined, z.string().trim().length(3, "Currency must be a 3-letter code").toUpperCase().optional()),
  docDate: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  status: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(MEMO_STATUS).optional().default("ACTIVE"),
  ),
  items: z.array(memoItemSchema).min(1, "Insert at least one memo item"),
});

const purchaseMemoItemsSchema = z.object({
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
  itemIds: z.array(z.string().uuid("Invalid item")).min(1, "Select at least one memo item"),
  referenceDocNo: optionalString(),
  paymentTerm: paymentTermSchema(),
  currency: z
    .preprocess(
      emptyToUndefined,
      z
        .string()
        .trim()
        .length(3, "Currency must be a 3-letter code")
        .toUpperCase()
        .optional(),
    )
    .refine((value) => !value || value === "USD", "Only USD currency is available now"),
  docDate: z.preprocess(emptyToUndefined, z.string().trim().optional()),
  status: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(PURCHASE_STATUS).optional().default("ACTIVE"),
  ),
  remark: optionalString(),
});

const returnMemoItemsSchema = z.object({
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
  itemIds: z.array(z.string().uuid("Invalid item")).min(1, "Select at least one memo item"),
  referenceDocNo: optionalString(),
  docDate: z.preprocess(emptyToUndefined, z.string().trim().optional()),
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
  (company.code || company.name || "MEMO")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "MEMO";

const buildMemoNo = (company, number) =>
  `${buildPrefix(company)}-MEMO-${String(number).padStart(6, "0")}`;

const buildPurchaseNo = (company, number) =>
  `${buildPrefix(company)}-PN-${String(number).padStart(6, "0")}`;

const buildItemId = (company, lotId) =>
  `${buildPrefix(company)}-ITEM-${String(lotId).padStart(6, "0")}`;

const resolveDepartmentContext = async (departmentId) =>
  prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      name: true,
      companyId: true,
      company: { select: { id: true, name: true, code: true } },
    },
  });

const resolveMemoAccount = async ({ accountId, companyId }) =>
  prisma.account.findFirst({
    where: {
      id: accountId,
      companyId,
      status: "ACTIVE",
      accountType: {
        name: {
          equals: "Vendor",
          mode: "insensitive",
        },
      },
    },
    select: {
      id: true,
      accountName: true,
      accountIndex: true,
      address: true,
      countryIso2: true,
      city: true,
      phone1: true,
      trnNo: true,
      companyId: true,
      state: { select: { id: true, name: true, code: true } },
      accountType: { select: { id: true, name: true } },
    },
  });

const resolveItemMasters = async ({ items, companyId }) => {
  const itemMasterIds = [...new Set(items.map((item) => item.itemMasterId))];
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

const reserveMemoSequence = async ({ tx, companyId, itemCount }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "nextMemoNumber",
      "updatedAt"
    )
    VALUES (${companyId}, ${itemCount + 1}, 2, 1, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextLotId" = "InventorySequence"."nextLotId" + ${itemCount},
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextMemoNumber" = "InventorySequence"."nextMemoNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextLotId", "nextDocumentNumber", "nextMemoNumber";
  `;

  const nextLotId = Number(rows[0]?.nextLotId ?? itemCount + 1);
  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextMemoNumber = Number(rows[0]?.nextMemoNumber ?? 2);

  return {
    firstLotId: nextLotId - itemCount,
    documentNumber: nextDocumentNumber - 1,
    memoNumber: nextMemoNumber - 1,
  };
};

const reservePurchaseDocumentSequence = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "nextMemoNumber",
      "updatedAt"
    )
    VALUES (${companyId}, 1, 2, 2, 1, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextPurchaseNoteNumber" = "InventorySequence"."nextPurchaseNoteNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextDocumentNumber", "nextPurchaseNoteNumber";
  `;

  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextPurchaseNoteNumber = Number(rows[0]?.nextPurchaseNoteNumber ?? 2);

  return {
    documentNumber: nextDocumentNumber - 1,
    purchaseNoteNumber: nextPurchaseNoteNumber - 1,
  };
};

const reserveMemoDocumentSequence = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "nextMemoNumber",
      "updatedAt"
    )
    VALUES (${companyId}, 1, 2, 1, 2, NOW())
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
    memoNumber: nextMemoNumber - 1,
  };
};

const inventoryItemInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
  itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
  purchaseNote: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
  purchaseReturn: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
  memo: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
  memoReturn: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
};

const memoInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  account: {
    select: {
      id: true,
      accountName: true,
      accountIndex: true,
      address: true,
      countryIso2: true,
      city: true,
      phone1: true,
      trnNo: true,
      state: { select: { id: true, name: true, code: true } },
    },
  },
  inventoryItems: {
    orderBy: { lotId: "asc" },
    include: inventoryItemInclude,
  },
  returnedInventoryItems: {
    orderBy: { lotId: "asc" },
    include: inventoryItemInclude,
  },
};

const purchaseNoteInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
  sourceCompany: { select: { id: true, name: true, code: true } },
  inventoryItems: {
    orderBy: { lotId: "asc" },
    include: inventoryItemInclude,
  },
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

const mapOriginDocument = ({ memo, purchase }) => {
  if (memo) return { documentType: "MEMO", ...memo };
  if (purchase) return { documentType: "PURCHASE_NOTE", ...purchase };
  return null;
};

const mapInventoryItem = (item) => {
  const purchase = mapPurchaseDocument(item.purchaseNote);
  const memo = mapMemoDocument(item.memo);
  const memoReturn = mapMemoDocument(item.memoReturn);
  const purchaseReturn = mapPurchaseDocument(item.purchaseReturn);

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
    originDocument: mapOriginDocument({ memo, purchase }),
    originMemo: memo,
    purchase,
    purchaseReturn,
    memoReturn,
    purchaseNote: purchase,
    memo,
  };
};

const memoDocumentItems = (memo) =>
  memo.docType === "Memo Return"
    ? memo.returnedInventoryItems
    : memo.inventoryItems;

const mapMemo = (memo) => ({
  id: memo.id,
  docId: memo.docId,
  memoNo: memo.memoNo,
  docType: memo.docType,
  vendorDocId: memo.vendorDocId,
  openDate: normalizeDate(memo.openDate),
  docDate: normalizeDate(memo.docDate),
  referenceDocNo: memo.referenceDocNo,
  itemType: memo.itemType,
  docQty: memo.docQty,
  docWeight: numberValue(memo.docWeight),
  docGrandTotalPrice: numberValue(memo.docGrandTotalPrice),
  mainGrandTotalPrice: numberValue(memo.mainGrandTotalPrice),
  balanceAmount: numberValue(memo.balanceAmount),
  paymentTerm: memo.paymentTerm,
  currency: memo.currency,
  docRateToMain: numberValue(memo.docRateToMain),
  docRateToSec: numberValue(memo.docRateToSec),
  status: memo.status,
  createdAt: normalizeDate(memo.createdAt),
  company: memo.company,
  department: memo.department,
  account: memo.account,
  items: memoDocumentItems(memo)?.map(mapInventoryItem) ?? undefined,
});

const mapSourceMemos = (items = []) =>
  [
    ...new Map(
      items
        .map((item) => item.memo)
        .filter(Boolean)
        .map((memo) => [
          memo.id,
          {
            id: memo.id,
            docId: memo.docId,
            memoNo: memo.memoNo,
            docType: memo.docType,
            docDate: normalizeDate(memo.docDate),
            status: memo.status,
          },
        ]),
    ).values(),
  ];

const purchaseDocumentItems = (note) =>
  note.docType === "Purchase Return"
    ? note.returnedInventoryItems
    : note.inventoryItems;

const mapPurchaseNote = (note) => ({
  id: note.id,
  docId: note.docId,
  purchaseNo: note.purchaseNo,
  purchaseFrom: note.purchaseFrom,
  docType: note.docType,
  openDate: normalizeDate(note.openDate),
  docDate: normalizeDate(note.docDate),
  referenceDocNo: note.referenceDocNo,
  docQty: note.docQty,
  docWeight: numberValue(note.docWeight),
  docGrandTotalPrice: numberValue(note.docGrandTotalPrice),
  mainGrandTotalPrice: numberValue(note.mainGrandTotalPrice),
  balanceAmount: numberValue(note.balanceAmount),
  paymentTerm: note.paymentTerm,
  currency: note.currency,
  status: note.status,
  createdAt: normalizeDate(note.createdAt),
  company: note.company,
  department: note.department,
  vendorAccount: note.vendorAccount,
  sourceCompany: note.sourceCompany,
  sourceMemos: mapSourceMemos(purchaseDocumentItems(note)),
  items: purchaseDocumentItems(note)?.map(mapInventoryItem) ?? undefined,
});

const createInventoryMovements = async ({
  tx,
  items,
  event,
  fromStatus,
  toStatus,
  documentType,
  documentId,
  documentNo,
  docId,
  userId,
  metadata,
}) => {
  if (!items.length) return;

  await tx.inventoryMovement.createMany({
    data: items.map((item) => ({
      inventoryItemId: item.id,
      event,
      fromStatus: fromStatus === undefined ? item.status ?? null : fromStatus,
      toStatus,
      documentType,
      documentId,
      documentNo,
      docId,
      companyId: item.companyId,
      departmentId: item.departmentId,
      createdById: userId,
      metadata: metadata ?? undefined,
    })),
  });
};

const buildTotals = (items) =>
  items.reduce(
    (sum, item) => {
      return {
        qty: sum.qty + item.quantity,
        weight: sum.weight + numberValue(item.weight),
        totalPrice: sum.totalPrice + numberValue(item.totalCost),
      };
    },
    { qty: 0, weight: 0, totalPrice: 0 },
  );

const createInventoryRows = ({ items, itemMasters, sequence, memo, department, account, userId }) =>
  items.map((item, index) => {
    const lotId = sequence.firstLotId + index;
    const totalDocPriceGross = item.totalCost;
    const itemMaster = itemMasters.get(item.itemMasterId);

    return {
      itemId: buildItemId(department.company, lotId),
      lotId,
      itemMasterId: itemMaster.id,
      itemType: itemMaster.itemType,
      lotName: item.lotName,
      quantity: item.quantity,
      weight: item.weight,
      totalCost: totalDocPriceGross,
      labAccountName: item.labAccountName ?? department.name,
      certificateNo: item.certificateNo,
      parcelOrStone: item.parcelOrStone,
      shape: item.shape ?? null,
      color: item.color ?? null,
      clarity: item.clarity ?? null,
      rap: item.rap ?? null,
      mainDiscount: item.mainDiscount ?? null,
      totalDocPriceGross,
      remark: item.remark ?? null,
      departmentAccountName: department.name,
      locationAccountName: department.name,
      status: "MEMO",
      memoId: memo.id,
      vendorAccountId: account.id,
      companyId: department.companyId,
      departmentId: department.id,
      createdById: userId,
    };
  });

export const createMemo = async (req, res) => {
  const result = memoPayloadSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const account = await resolveMemoAccount({
    accountId: data.accountId,
    companyId: department.companyId,
  });
  if (!account) {
    return sendError(res, "Vendor account not found for selected company", 404, {
      accountId: ["Select a valid vendor account"],
    });
  }

  const itemMasters = await resolveItemMasters({
    items: data.items,
    companyId: department.companyId,
  });
  if (!itemMasters) {
    return sendError(res, "Item not found for selected company", 404, {
      itemMasterId: ["Select a valid item"],
    });
  }

  const totals = buildTotals(data.items);

  const memo = await prisma.$transaction(async (tx) => {
    const sequence = await reserveMemoSequence({
      tx,
      companyId: department.companyId,
      itemCount: data.items.length,
    });
    const memoNo = buildMemoNo(department.company, sequence.memoNumber);

    const created = await tx.memo.create({
      data: {
        docId: sequence.documentNumber,
        memoNo,
        docType: "Memo In",
        vendorDocId: account.accountIndex ?? null,
        docDate: parseDate(data.docDate),
        referenceDocNo: data.referenceDocNo ?? null,
        itemType: data.itemType ?? null,
        docQty: totals.qty,
        docWeight: totals.weight,
        docGrandTotalPrice: totals.totalPrice,
        mainGrandTotalPrice: totals.totalPrice,
        balanceAmount: totals.totalPrice,
        paymentTerm: data.paymentTerm,
        currency: data.currency ?? "USD",
        status: data.status,
        companyId: department.companyId,
        departmentId: department.id,
        accountId: account.id,
        createdById: req.user.userId,
      },
    });

    await tx.inventoryItem.createMany({
      data: createInventoryRows({
        items: data.items,
        itemMasters,
        sequence,
        memo: created,
        department,
        account,
        userId: req.user.userId,
      }),
    });

    const createdItems = await tx.inventoryItem.findMany({
      where: { memoId: created.id },
      select: { id: true, companyId: true, departmentId: true, status: true },
    });

    await createInventoryMovements({
      tx,
      items: createdItems,
      event: "MEMO_IN",
      fromStatus: null,
      toStatus: "MEMO",
      documentType: "MEMO",
      documentId: created.id,
      documentNo: created.memoNo,
      docId: created.docId,
      userId: req.user.userId,
    });

    return tx.memo.findUnique({
      where: { id: created.id },
      include: memoInclude,
    });
  });

  return sendSuccess(res, "Memo created successfully", { memo: mapMemo(memo) }, 201);
};

export const purchaseMemoInventoryItems = async (req, res) => {
  const result = purchaseMemoItemsSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const itemIds = [...new Set(data.itemIds)];
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const memoItems = await prisma.inventoryItem.findMany({
    where: {
      id: { in: itemIds },
      departmentId: department.id,
    },
    include: {
      ...inventoryItemInclude,
      memo: {
        select: {
          id: true,
          docId: true,
          memoNo: true,
          docType: true,
          docDate: true,
          status: true,
          paymentTerm: true,
          currency: true,
        },
      },
    },
  });

  if (memoItems.length !== itemIds.length) {
    return sendError(res, "Some selected memo items were not found in this department", 404);
  }

  const invalidItem = memoItems.find(
    (item) => item.status !== "MEMO" || !item.memoId || item.purchaseNoteId,
  );
  if (invalidItem) {
    return sendError(res, "Only unpurchased Memo In items can be purchased", 400);
  }

  const inactiveMemoItem = memoItems.find((item) => item.memo?.status !== "ACTIVE");
  if (inactiveMemoItem) {
    return sendError(res, "Cancelled memo items cannot be purchased", 400);
  }

  const wrongCompanyItem = memoItems.find(
    (item) => item.companyId !== department.companyId,
  );
  if (wrongCompanyItem) {
    return sendError(res, "Selected memo items do not belong to the selected company", 400);
  }

  const vendorIds = new Set(memoItems.map((item) => item.vendorAccountId).filter(Boolean));
  if (vendorIds.size !== 1 || memoItems.some((item) => !item.vendorAccountId)) {
    return sendError(res, "Select memo items from one vendor only", 400);
  }

  const vendorAccountId = [...vendorIds][0];
  const totals = buildTotals(memoItems);
  const memoNos = [...new Set(memoItems.map((item) => item.memo?.memoNo).filter(Boolean))];
  const referenceDocNo =
    data.referenceDocNo ?? (memoNos.length > 0 ? `Memo In: ${memoNos.join(", ")}` : null);

  try {
    const purchaseNote = await prisma.$transaction(async (tx) => {
      const sequence = await reservePurchaseDocumentSequence({
        tx,
        companyId: department.companyId,
      });
      const purchaseNo = buildPurchaseNo(department.company, sequence.purchaseNoteNumber);

      const note = await tx.purchaseNote.create({
        data: {
          docId: sequence.documentNumber,
          purchaseNo,
          purchaseFrom: "LOCAL_PURCHASE",
          docType: "Memo Purchase",
          docDate: parseDate(data.docDate),
          referenceDocNo,
          docQty: totals.qty,
          docWeight: totals.weight,
          docGrandTotalPrice: totals.totalPrice,
          mainGrandTotalPrice: totals.totalPrice,
          balanceAmount: totals.totalPrice,
          paymentTerm: data.paymentTerm,
          currency: data.currency ?? "USD",
          status: data.status,
          companyId: department.companyId,
          departmentId: department.id,
          vendorAccountId,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: { in: itemIds },
          departmentId: department.id,
          status: "MEMO",
          memoId: { not: null },
          purchaseNoteId: null,
        },
        data: {
          status: "STOCK",
          purchaseNoteId: note.id,
          ...(data.remark ? { remark: data.remark } : {}),
        },
      });

      if (updateResult.count !== itemIds.length) {
        throw new Error("MEMO_ITEMS_CHANGED");
      }

      await createInventoryMovements({
        tx,
        items: memoItems,
        event: "MEMO_PURCHASED",
        fromStatus: "MEMO",
        toStatus: "STOCK",
        documentType: "PURCHASE_NOTE",
        documentId: note.id,
        documentNo: note.purchaseNo,
        docId: note.docId,
        userId: req.user.userId,
        metadata: { referenceDocNo },
      });

      return tx.purchaseNote.findUnique({
        where: { id: note.id },
        include: purchaseNoteInclude,
      });
    });

    return sendSuccess(
      res,
      "Memo items purchased successfully",
      { purchaseNote: mapPurchaseNote(purchaseNote) },
      201,
    );
  } catch (error) {
    if (error?.message === "MEMO_ITEMS_CHANGED") {
      return sendError(
        res,
        "Selected memo items changed before purchase was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const returnMemoInventoryItems = async (req, res) => {
  const result = returnMemoItemsSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const itemIds = [...new Set(data.itemIds)];
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const memoItems = await prisma.inventoryItem.findMany({
    where: {
      id: { in: itemIds },
      departmentId: department.id,
    },
    include: {
      ...inventoryItemInclude,
      memo: {
        select: {
          id: true,
          docId: true,
          memoNo: true,
          docType: true,
          docDate: true,
          status: true,
          paymentTerm: true,
          currency: true,
        },
      },
    },
  });

  if (memoItems.length !== itemIds.length) {
    return sendError(res, "Some selected memo items were not found in this department", 404);
  }

  const invalidItem = memoItems.find(
    (item) => item.status !== "MEMO" || !item.memoId || item.purchaseNoteId,
  );
  if (invalidItem) {
    return sendError(res, "Only live Memo In items can be returned", 400);
  }

  const wrongCompanyItem = memoItems.find(
    (item) => item.companyId !== department.companyId,
  );
  if (wrongCompanyItem) {
    return sendError(res, "Selected memo items do not belong to the selected company", 400);
  }

  const vendorIds = new Set(memoItems.map((item) => item.vendorAccountId).filter(Boolean));
  if (vendorIds.size !== 1 || memoItems.some((item) => !item.vendorAccountId)) {
    return sendError(res, "Select memo items from one vendor only", 400);
  }

  const accountId = [...vendorIds][0];
  const totals = buildTotals(memoItems);
  const memoNos = [...new Set(memoItems.map((item) => item.memo?.memoNo).filter(Boolean))];
  const referenceDocNo =
    data.referenceDocNo ?? (memoNos.length > 0 ? `Memo Return: ${memoNos.join(", ")}` : null);

  try {
    const memoReturn = await prisma.$transaction(async (tx) => {
      const sequence = await reserveMemoDocumentSequence({
        tx,
        companyId: department.companyId,
      });
      const memoNo = buildMemoNo(department.company, sequence.memoNumber);

      const memo = await tx.memo.create({
        data: {
          docId: sequence.documentNumber,
          memoNo,
          docType: "Memo Return",
          vendorDocId: null,
          docDate: parseDate(data.docDate),
          referenceDocNo,
          itemType: null,
          docQty: totals.qty,
          docWeight: totals.weight,
          docGrandTotalPrice: totals.totalPrice,
          mainGrandTotalPrice: totals.totalPrice,
          balanceAmount: 0,
          paymentTerm: null,
          currency: "USD",
          status: "ACTIVE",
          companyId: department.companyId,
          departmentId: department.id,
          accountId,
          createdById: req.user.userId,
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: { in: itemIds },
          departmentId: department.id,
          status: "MEMO",
          memoId: { not: null },
          purchaseNoteId: null,
        },
        data: {
          status: "RETURNED",
          memoReturnId: memo.id,
        },
      });

      if (updateResult.count !== itemIds.length) {
        throw new Error("MEMO_ITEMS_CHANGED");
      }

      await createInventoryMovements({
        tx,
        items: memoItems,
        event: "MEMO_RETURN",
        fromStatus: "MEMO",
        toStatus: "RETURNED",
        documentType: "MEMO",
        documentId: memo.id,
        documentNo: memo.memoNo,
        docId: memo.docId,
        userId: req.user.userId,
        metadata: { referenceDocNo },
      });

      return tx.memo.findUnique({
        where: { id: memo.id },
        include: memoInclude,
      });
    });

    return sendSuccess(
      res,
      "Memo items returned successfully",
      { memo: mapMemo(memoReturn) },
      201,
    );
  } catch (error) {
    if (error?.message === "MEMO_ITEMS_CHANGED") {
      return sendError(
        res,
        "Selected memo items changed before return was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getMemoInventoryItems = async (req, res) => {
  const { departmentId, search } = req.query;

  if (!departmentId) {
    return sendError(res, "departmentId is required", 400);
  }

  const where = {
    departmentId: String(departmentId),
    status: "MEMO",
    memoId: { not: null },
  };
  const searchValue = String(search ?? "").trim();

  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue)
        ? { memo: { docId: Number(searchValue) } }
        : undefined,
      { itemId: { contains: searchValue, mode: "insensitive" } },
      { itemMaster: { itemName: { contains: searchValue, mode: "insensitive" } } },
      { itemMaster: { itemType: { contains: searchValue, mode: "insensitive" } } },
      { lotName: { contains: searchValue, mode: "insensitive" } },
      { labAccountName: { contains: searchValue, mode: "insensitive" } },
      { certificateNo: { contains: searchValue, mode: "insensitive" } },
      { memo: { memoNo: { contains: searchValue, mode: "insensitive" } } },
      { vendorAccount: { accountName: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);
  }

  const inventoryItems = await prisma.inventoryItem.findMany({
    where,
    orderBy: { lotId: "desc" },
    include: inventoryItemInclude,
  });

  return sendSuccess(res, "Memo inventory items retrieved successfully", {
    inventoryItems: inventoryItems.map(mapInventoryItem),
  });
};

export const getMemos = async (req, res) => {
  const { departmentId, search, docType } = req.query;

  if (!departmentId) {
    return sendError(res, "departmentId is required", 400);
  }

  const where = { departmentId: String(departmentId) };
  const docTypeValue = String(docType ?? "").trim();
  const searchValue = String(search ?? "").trim();

  if (docTypeValue) {
    where.docType = docTypeValue;
  }

  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue) ? { docId: Number(searchValue) } : undefined,
      { memoNo: { contains: searchValue, mode: "insensitive" } },
      { docType: { contains: searchValue, mode: "insensitive" } },
      { referenceDocNo: { contains: searchValue, mode: "insensitive" } },
      { account: { accountName: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);
  }

  const memos = await prisma.memo.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: memoInclude,
  });

  return sendSuccess(res, "Memos retrieved successfully", {
    memos: memos.map(mapMemo),
  });
};

export const getMemo = async (req, res) => {
  const { id } = req.params;
  const { departmentId, docType } = req.query;

  if (!departmentId) {
    return sendError(res, "departmentId is required", 400);
  }

  const where = { id, departmentId: String(departmentId) };
  const docTypeValue = String(docType ?? "").trim();
  if (docTypeValue) {
    where.docType = docTypeValue;
  }

  const memo = await prisma.memo.findFirst({
    where,
    include: memoInclude,
  });

  if (!memo) return sendError(res, "Memo not found", 404);

  return sendSuccess(res, "Memo retrieved successfully", { memo: mapMemo(memo) });
};

export const deleteMemo = async (req, res) => {
  return sendError(res, "Memo documents are immutable. Use Memo Return instead.", 400);
};
