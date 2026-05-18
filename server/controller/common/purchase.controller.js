import { z } from "zod";

import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const PURCHASE_FROM = ["LOCAL_PURCHASE", "IMPORT_PURCHASE", "INTERNAL_PURCHASE"];
const PARCEL_OR_STONE = ["PARCEL", "STONE"];
const PURCHASE_STATUS = ["ACTIVE", "CANCELLED"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalUuid = () =>
  z.preprocess(emptyToUndefined, z.string().uuid("Invalid ID").optional());

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

const purchaseItemSchema = z.object({
  itemMasterId: z.string({ required_error: "Select an item" }).uuid("Select an item"),
  lotName: z.string({ required_error: "Lot name is required" }).trim().min(1, "Lot name is required"),
  quantity: z.coerce.number().int().positive("Quantity must be greater than 0"),
  weight: z.coerce.number().positive("Weight must be greater than 0"),
  totalCost: z.coerce.number().positive("Total cost must be greater than 0"),
  shape: optionalString(),
  color: optionalString(),
  clarity: optionalString(),
  labAccountName: optionalString(),
  certificateNo: numericString("Certificate no."),
  rap: optionalDecimal(),
  mainDiscount: optionalDecimal(),
  remark: optionalString(),
  parcelOrStone: z.enum(PARCEL_OR_STONE),
});

const createPurchaseNoteSchema = z
  .object({
    purchaseFrom: z.enum(PURCHASE_FROM),
    departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
    vendorAccountId: optionalUuid(),
    sourceCompanyId: optionalUuid(),
    referenceDocNo: optionalString(),
    paymentTerm: paymentTermSchema(),
    currency: z.preprocess(emptyToUndefined, z.string().trim().length(3, "Currency must be a 3-letter code").toUpperCase().optional()),
    docDate: z.preprocess(emptyToUndefined, z.string().trim().optional()),
    status: z.preprocess(
      (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
      z.enum(PURCHASE_STATUS).optional().default("ACTIVE"),
    ),
    items: z.array(purchaseItemSchema).min(1, "Insert at least one product"),
  })
  .superRefine((data, context) => {
    if (data.purchaseFrom === "LOCAL_PURCHASE" && !data.vendorAccountId) {
      context.addIssue({
        code: "custom",
        path: ["vendorAccountId"],
        message: "Select a vendor account",
      });
    }
  });

const returnInventoryItemsSchema = z.object({
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
  itemIds: z.array(z.string().uuid("Invalid item")).min(1, "Select at least one inventory item"),
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

const docTypeLabel = (purchaseFrom) =>
  purchaseFrom
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const buildPrefix = (company) =>
  (company.code || company.name || "PUR")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "PUR";

const buildPurchaseNo = (company, number) =>
  `${buildPrefix(company)}-PN-${String(number).padStart(6, "0")}`;

const buildItemId = (company, lotId) =>
  `${buildPrefix(company)}-ITEM-${String(lotId).padStart(6, "0")}`;

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

const resolveVendorAccount = async ({ vendorAccountId, companyId }) => {
  if (!vendorAccountId) return null;

  return prisma.account.findFirst({
    where: {
      id: vendorAccountId,
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
      companyId: true,
      accountType: { select: { id: true, name: true } },
    },
  });
};

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

const reserveInventorySequence = async ({ tx, companyId, itemCount }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "updatedAt"
    )
    VALUES (${companyId}, ${itemCount + 1}, 2, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextLotId" = "InventorySequence"."nextLotId" + ${itemCount},
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextPurchaseNoteNumber" = "InventorySequence"."nextPurchaseNoteNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextLotId", "nextDocumentNumber", "nextPurchaseNoteNumber";
  `;

  const nextLotId = Number(rows[0]?.nextLotId ?? itemCount + 1);
  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextPurchaseNoteNumber = Number(rows[0]?.nextPurchaseNoteNumber ?? 2);

  return {
    firstLotId: nextLotId - itemCount,
    documentNumber: nextDocumentNumber - 1,
    purchaseNoteNumber: nextPurchaseNoteNumber - 1,
  };
};

const reservePurchaseDocumentSequence = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "updatedAt"
    )
    VALUES (${companyId}, 1, 2, 2, NOW())
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

const buildTotals = (items) =>
  items.reduce(
    (sum, item) => ({
      qty: sum.qty + item.quantity,
      weight: sum.weight + numberValue(item.weight),
      totalCost: sum.totalCost + numberValue(item.totalCost),
    }),
    { qty: 0, weight: 0, totalCost: 0 },
  );

const purchaseNoteInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
  sourceCompany: { select: { id: true, name: true, code: true } },
  inventoryItems: {
    orderBy: { lotId: "asc" },
    include: {
      company: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
      itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
      purchaseNote: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
      purchaseReturn: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
      memo: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
      memoReturn: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
    },
  },
  returnedInventoryItems: {
    orderBy: { lotId: "asc" },
    include: {
      company: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true } },
      vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
      itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
      purchaseNote: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
      purchaseReturn: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
      memo: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
      memoReturn: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
    },
  },
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

export const createPurchaseNote = async (req, res) => {
  const result = createPurchaseNoteSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;

  if (data.purchaseFrom !== "LOCAL_PURCHASE") {
    return sendError(res, "Only local purchase creation is available now", 400);
  }

  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const vendorAccount = await resolveVendorAccount({
    vendorAccountId: data.vendorAccountId,
    companyId: department.companyId,
  });
  if (!vendorAccount) {
    return sendError(res, "Vendor account not found for selected company", 404, {
      vendorAccountId: ["Select a valid vendor account"],
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

  const totals = data.items.reduce(
    (sum, item) => ({
      qty: sum.qty + item.quantity,
      weight: sum.weight + item.weight,
      totalCost: sum.totalCost + item.totalCost,
    }),
    { qty: 0, weight: 0, totalCost: 0 },
  );

  const purchaseNote = await prisma.$transaction(async (tx) => {
    const sequence = await reserveInventorySequence({
      tx,
      companyId: department.companyId,
      itemCount: data.items.length,
    });
    const purchaseNo = buildPurchaseNo(department.company, sequence.purchaseNoteNumber);

    const note = await tx.purchaseNote.create({
      data: {
        docId: sequence.documentNumber,
        purchaseNo,
        purchaseFrom: data.purchaseFrom,
        docType: docTypeLabel(data.purchaseFrom),
        docDate: parseDate(data.docDate),
        referenceDocNo: data.referenceDocNo ?? null,
        docQty: totals.qty,
        docWeight: totals.weight,
        docGrandTotalPrice: totals.totalCost,
        mainGrandTotalPrice: totals.totalCost,
        balanceAmount: totals.totalCost,
        paymentTerm: data.paymentTerm,
        currency: data.currency ?? "USD",
        status: data.status,
        companyId: department.companyId,
        departmentId: department.id,
        vendorAccountId: vendorAccount.id,
        createdById: req.user.userId,
      },
    });

    await tx.inventoryItem.createMany({
      data: data.items.map((item, index) => {
        const lotId = sequence.firstLotId + index;
        const itemMaster = itemMasters.get(item.itemMasterId);

        return {
          itemId: buildItemId(department.company, lotId),
          lotId,
          itemMasterId: itemMaster.id,
          itemType: itemMaster.itemType,
          lotName: item.lotName,
          quantity: item.quantity,
          weight: item.weight,
          totalCost: item.totalCost,
          labAccountName: item.labAccountName ?? department.name,
          certificateNo: item.certificateNo,
          parcelOrStone: item.parcelOrStone,
          shape: item.shape ?? null,
          color: item.color ?? null,
          clarity: item.clarity ?? null,
          rap: item.rap ?? null,
          mainDiscount: item.mainDiscount ?? null,
          totalDocPriceGross: item.totalCost,
          remark: item.remark ?? null,
          departmentAccountName: department.name,
          locationAccountName: department.name,
          status: "STOCK",
          purchaseNoteId: note.id,
          vendorAccountId: vendorAccount.id,
          companyId: department.companyId,
          departmentId: department.id,
          createdById: req.user.userId,
        };
      }),
    });

    const createdItems = await tx.inventoryItem.findMany({
      where: { purchaseNoteId: note.id },
      select: { id: true, companyId: true, departmentId: true, status: true },
    });

    await createInventoryMovements({
      tx,
      items: createdItems,
      event: "PURCHASE_IN",
      fromStatus: null,
      toStatus: "STOCK",
      documentType: "PURCHASE_NOTE",
      documentId: note.id,
      documentNo: note.purchaseNo,
      docId: note.docId,
      userId: req.user.userId,
    });

    return tx.purchaseNote.findUnique({
      where: { id: note.id },
      include: purchaseNoteInclude,
    });
  });

  return sendSuccess(
    res,
    "Purchase note created successfully",
    { purchaseNote: mapPurchaseNote(purchaseNote) },
    201,
  );
};

export const returnInventoryItems = async (req, res) => {
  const result = returnInventoryItemsSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const itemIds = [...new Set(data.itemIds)];
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const inventoryItems = await prisma.inventoryItem.findMany({
    where: {
      id: { in: itemIds },
      departmentId: department.id,
    },
    include: inventoryItemInclude,
  });

  if (inventoryItems.length !== itemIds.length) {
    return sendError(res, "Some selected inventory items were not found in this department", 404);
  }

  const invalidItem = inventoryItems.find(
    (item) => item.status !== "STOCK" || !item.purchaseNoteId,
  );
  if (invalidItem) {
    return sendError(res, "Only purchased stock items can be returned", 400);
  }

  const wrongCompanyItem = inventoryItems.find(
    (item) => item.companyId !== department.companyId,
  );
  if (wrongCompanyItem) {
    return sendError(res, "Selected inventory items do not belong to the selected company", 400);
  }

  const vendorIds = new Set(
    inventoryItems.map((item) => item.vendorAccountId).filter(Boolean),
  );
  if (vendorIds.size !== 1 || inventoryItems.some((item) => !item.vendorAccountId)) {
    return sendError(res, "Select stock items from one vendor only", 400);
  }

  const vendorAccountId = [...vendorIds][0];
  const totals = buildTotals(inventoryItems);
  const purchaseNos = [
    ...new Set(
      inventoryItems.map((item) => item.purchaseNote?.purchaseNo).filter(Boolean),
    ),
  ];
  const referenceDocNo =
    data.referenceDocNo ??
    (purchaseNos.length > 0 ? `Purchase Return: ${purchaseNos.join(", ")}` : null);

  try {
    const purchaseReturn = await prisma.$transaction(async (tx) => {
      const sequence = await reservePurchaseDocumentSequence({
        tx,
        companyId: department.companyId,
      });
      const purchaseNo = buildPurchaseNo(
        department.company,
        sequence.purchaseNoteNumber,
      );

      const note = await tx.purchaseNote.create({
        data: {
          docId: sequence.documentNumber,
          purchaseNo,
          purchaseFrom: "LOCAL_PURCHASE",
          docType: "Purchase Return",
          docDate: parseDate(data.docDate),
          referenceDocNo,
          docQty: totals.qty,
          docWeight: totals.weight,
          docGrandTotalPrice: totals.totalCost,
          mainGrandTotalPrice: totals.totalCost,
          balanceAmount: 0,
          paymentTerm: null,
          currency: "USD",
          status: "ACTIVE",
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
          status: "STOCK",
          purchaseNoteId: { not: null },
        },
        data: {
          status: "RETURNED",
          purchaseReturnId: note.id,
        },
      });

      if (updateResult.count !== itemIds.length) {
        throw new Error("INVENTORY_ITEMS_CHANGED");
      }

      await createInventoryMovements({
        tx,
        items: inventoryItems,
        event: "PURCHASE_RETURN",
        fromStatus: "STOCK",
        toStatus: "RETURNED",
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
      "Purchase items returned successfully",
      { purchaseNote: mapPurchaseNote(purchaseReturn) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEMS_CHANGED") {
      return sendError(
        res,
        "Selected inventory items changed before return was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getPurchaseNotes = async (req, res) => {
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
      { purchaseNo: { contains: searchValue, mode: "insensitive" } },
      { docType: { contains: searchValue, mode: "insensitive" } },
      { referenceDocNo: { contains: searchValue, mode: "insensitive" } },
      { vendorAccount: { accountName: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);
  }

  const purchaseNotes = await prisma.purchaseNote.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: purchaseNoteInclude,
  });

  return sendSuccess(res, "Purchase notes retrieved successfully", {
    purchaseNotes: purchaseNotes.map(mapPurchaseNote),
  });
};

export const getPurchaseNote = async (req, res) => {
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

  const purchaseNote = await prisma.purchaseNote.findFirst({
    where,
    include: purchaseNoteInclude,
  });

  if (!purchaseNote) return sendError(res, "Purchase note not found", 404);

  return sendSuccess(res, "Purchase note retrieved successfully", {
    purchaseNote: mapPurchaseNote(purchaseNote),
  });
};

export const getInventoryItems = async (req, res) => {
  const { departmentId, search } = req.query;

  if (!departmentId) {
    return sendError(res, "departmentId is required", 400);
  }

  const where = {
    departmentId: String(departmentId),
    status: "STOCK",
    purchaseNoteId: { not: null },
  };
  const searchValue = String(search ?? "").trim();

  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue)
        ? { purchaseNote: { docId: Number(searchValue) } }
        : undefined,
      /^\d+$/.test(searchValue)
        ? { memo: { docId: Number(searchValue) } }
        : undefined,
      { itemId: { contains: searchValue, mode: "insensitive" } },
      { itemMaster: { itemName: { contains: searchValue, mode: "insensitive" } } },
      { itemMaster: { itemType: { contains: searchValue, mode: "insensitive" } } },
      { lotName: { contains: searchValue, mode: "insensitive" } },
      { labAccountName: { contains: searchValue, mode: "insensitive" } },
      { certificateNo: { contains: searchValue, mode: "insensitive" } },
      { purchaseNote: { purchaseNo: { contains: searchValue, mode: "insensitive" } } },
      { memo: { memoNo: { contains: searchValue, mode: "insensitive" } } },
      { vendorAccount: { accountName: { contains: searchValue, mode: "insensitive" } } },
    ].filter(Boolean);
  }

  const inventoryItems = await prisma.inventoryItem.findMany({
    where,
    orderBy: { lotId: "desc" },
    include: inventoryItemInclude,
  });

  return sendSuccess(res, "Inventory items retrieved successfully", {
    inventoryItems: inventoryItems.map(mapInventoryItem),
  });
};

export const getInventoryItemByLot = async (req, res) => {
  const { departmentId } = req.query;
  const lotId = Number(req.params.lotId);

  if (!departmentId) {
    return sendError(res, "departmentId is required", 400);
  }

  if (!Number.isInteger(lotId) || lotId <= 0) {
    return sendError(res, "Valid lotId is required", 400);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      departmentId: String(departmentId),
      lotId,
      status: "STOCK",
      purchaseNoteId: { not: null },
    },
    include: inventoryItemInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Stock item not found for this Lot ID", 404);
  }

  return sendSuccess(res, "Inventory item retrieved successfully", {
    inventoryItem: mapInventoryItem(inventoryItem),
  });
};
