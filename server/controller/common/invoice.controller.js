import { z } from "zod";

import {
  getAccessibleDepartmentIds,
  userHasDepartmentModuleAccess,
} from "../../helper/departmentAccess.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";
import { normalizePermissions, permissionAllows } from "../../config/modules.ts";

const INVOICE_TYPES = ["LOCAL_INVOICE", "EXPORT_INVOICE", "INTERNAL_INVOICE"];
const INVOICE_STATUSES = ["ACTIVE", "PENDING", "DRAFT", "CANCELLED"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalUuid = () =>
  z.preprocess(emptyToUndefined, z.string().uuid("Invalid ID").optional());

const optionalPositiveInt = () =>
  z.preprocess(emptyToUndefined, z.coerce.number().int().positive().optional());

const invoiceTypeSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}, z.enum(INVOICE_TYPES));

const invoiceStatusSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}, z.enum(INVOICE_STATUSES));

const docDateSchema = z.preprocess(emptyToUndefined, z.string().trim().optional());

const invoiceDestinationSchema = {
  accountId: optionalUuid(),
  sourceCompanyId: optionalUuid(),
  destinationDepartmentId: optionalUuid(),
};

const addDestinationRule = (schema) =>
  schema.superRefine((data, context) => {
    if (data.invoiceType === "INTERNAL_INVOICE") {
      if (!data.sourceCompanyId) {
        context.addIssue({
          code: "custom",
          path: ["sourceCompanyId"],
          message: "Select a company",
        });
      }
      return;
    }

    if (!data.accountId) {
      context.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Select a customer",
      });
    }
  });

const manualInvoiceSchema = addDestinationRule(
  z.object({
    departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
    ...invoiceDestinationSchema,
    referenceDocNo: z.string({ required_error: "Reference Doc No is required" }).trim().min(1, "Reference Doc No is required"),
    invoiceType: invoiceTypeSchema,
    docDate: docDateSchema,
    currency: z.preprocess(emptyToUndefined, z.string().trim().length(3, "Currency must be a 3-letter code").toUpperCase().optional()),
    status: invoiceStatusSchema.optional().default("ACTIVE"),
    remark: optionalString(),
    notes: optionalString(),
    item: z.object({
      lotId: optionalPositiveInt(),
      itemName: z.string({ required_error: "Item name is required" }).trim().min(1, "Item name is required"),
      itemDescription: optionalString(),
      quantity: z.coerce.number().int().positive("Quantity must be greater than 0"),
      unitPrice: z.coerce.number().positive("Unit price must be greater than 0"),
    }),
  }),
);

const inventoryInvoiceSchema = addDestinationRule(
  z.object({
    departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
    inventoryItemId: z.string({ required_error: "Select an inventory item" }).uuid("Invalid inventory item"),
    ...invoiceDestinationSchema,
    referenceDocNo: z.string({ required_error: "Reference Doc No is required" }).trim().min(1, "Reference Doc No is required"),
    invoiceType: invoiceTypeSchema,
    docDate: docDateSchema,
    currency: z.preprocess(emptyToUndefined, z.string().trim().length(3, "Currency must be a 3-letter code").toUpperCase().optional()),
    status: invoiceStatusSchema.optional().default("ACTIVE"),
    remark: optionalString(),
    notes: optionalString(),
  }),
);

const invoiceReturnSchema = z.object({
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
  (company.code || company.name || "INV")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 6) || "INV";

const buildInvoiceNo = (company, number) =>
  `${buildPrefix(company)}-INV-${String(number).padStart(6, "0")}`;

const invoiceStockOriginWhere = {
  OR: [
    { purchaseNoteId: { not: null } },
    { returnedFromProductionId: { not: null } },
  ],
};

const buildPurchaseNo = (company, number) =>
  `${buildPrefix(company)}-PN-${String(number).padStart(6, "0")}`;

const buildItemId = (company, lotId) =>
  `${buildPrefix(company)}-ITEM-${String(lotId).padStart(6, "0")}`;

const invoiceTypeLabel = (value) =>
  value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

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

const resolveInvoiceAccount = async ({ accountId, companyId }) => {
  if (!accountId) return null;

  return prisma.account.findFirst({
    where: {
      id: accountId,
      companyId,
      status: "ACTIVE",
      accountType: {
        name: { in: ["Customer", "Group Customer"] },
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
      email: true,
      trnNo: true,
      state: { select: { id: true, name: true, code: true } },
      accountType: { select: { id: true, name: true } },
    },
  });
};

const resolveSourceCompany = async ({ sourceCompanyId, currentCompanyId }) => {
  if (!sourceCompanyId) return null;

  return prisma.company.findFirst({
    where: {
      id: sourceCompanyId,
      status: "ACTIVE",
      NOT: { id: currentCompanyId },
    },
    select: {
      id: true,
      name: true,
      code: true,
      status: true,
      primaryDepartment: {
        select: {
          id: true,
          name: true,
          country: true,
          isActive: true,
          companyId: true,
        },
      },
    },
  });
};

const destinationDepartmentSelect = {
  id: true,
  name: true,
  country: true,
  isActive: true,
  companyId: true,
};

const hasInventoryReadAccess = (permissions) => {
  const normalized = normalizePermissions(permissions);
  const modulePermission = normalized.find((item) => item.module === "INVENTORY_LIST");
  return permissionAllows(modulePermission?.permission, "READ_ONLY");
};

const userCanReceiveInDepartment = async ({ userId, userRole, departmentId }) => {
  if (userRole === "ORG_ADMIN") return true;

  const access = await prisma.userDepartmentAccess.findUnique({
    where: {
      userId_departmentId: {
        userId,
        departmentId,
      },
    },
    select: { permissions: true },
  });

  return access ? hasInventoryReadAccess(access.permissions) : false;
};

const resolveInternalDestinationDepartment = async ({
  sourceCompany,
  destinationDepartmentId,
  userId,
  userRole,
}) => {
  if (!sourceCompany) {
    return {
      department: null,
      errorMessage: "Company not found for internal invoice",
      fieldErrors: { sourceCompanyId: ["Select a valid company"] },
    };
  }

  if (destinationDepartmentId) {
    const destinationDepartment = await prisma.department.findFirst({
      where: {
        id: destinationDepartmentId,
        companyId: sourceCompany.id,
        isActive: true,
      },
      select: destinationDepartmentSelect,
    });

    if (!destinationDepartment) {
      return {
        department: null,
        errorMessage: "Destination department is not valid for selected company",
        fieldErrors: {
          destinationDepartmentId: ["Select an active department from the selected company"],
        },
      };
    }

    const hasAccess = await userCanReceiveInDepartment({
      userId,
      userRole,
      departmentId: destinationDepartment.id,
    });

    if (!hasAccess) {
      return {
        department: null,
        errorMessage: "You do not have inventory access to the destination department",
        fieldErrors: {
          destinationDepartmentId: ["Select a department where you can view inventory"],
        },
      };
    }

    return { department: destinationDepartment };
  }

  const primaryDepartment =
    sourceCompany.primaryDepartment?.isActive ? sourceCompany.primaryDepartment : null;

  if (userRole === "ORG_ADMIN") {
    if (primaryDepartment) return { department: primaryDepartment };

    return {
      department: null,
      errorMessage: "Destination company primary department is not configured",
      fieldErrors: {
        sourceCompanyId: ["Select a company with an active primary department"],
      },
    };
  }

  const destinationAccesses = await prisma.userDepartmentAccess.findMany({
    where: {
      userId,
      department: {
        companyId: sourceCompany.id,
        isActive: true,
      },
    },
    select: {
      permissions: true,
      department: {
        select: destinationDepartmentSelect,
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const readableDepartments = destinationAccesses
    .filter((access) => hasInventoryReadAccess(access.permissions))
    .map((access) => access.department);

  if (
    primaryDepartment &&
    readableDepartments.some((department) => department.id === primaryDepartment.id)
  ) {
    return { department: primaryDepartment };
  }

  if (readableDepartments.length === 1) {
    return { department: readableDepartments[0] };
  }

  if (primaryDepartment) {
    return {
      department: null,
      errorMessage: `Destination company primary department (${primaryDepartment.name}) is not accessible`,
      fieldErrors: {
        destinationDepartmentId: ["Select an accessible destination department"],
      },
    };
  }

  return {
    department: null,
    errorMessage: "Destination company primary department is not configured",
    fieldErrors: {
      sourceCompanyId: ["Select a company with an active primary department"],
    },
  };
};

const ensureUniqueReference = async ({ companyId, referenceDocNo }) => {
  const existing = await prisma.invoice.findFirst({
    where: { companyId, referenceDocNo },
    select: { id: true },
  });
  return !existing;
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

const reserveInternalReceiptSequence = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "InventorySequence" (
      "companyId",
      "nextLotId",
      "nextDocumentNumber",
      "nextPurchaseNoteNumber",
      "updatedAt"
    )
    VALUES (${companyId}, 2, 2, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextLotId" = "InventorySequence"."nextLotId" + 1,
      "nextDocumentNumber" = "InventorySequence"."nextDocumentNumber" + 1,
      "nextPurchaseNoteNumber" = "InventorySequence"."nextPurchaseNoteNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextLotId", "nextDocumentNumber", "nextPurchaseNoteNumber";
  `;

  const nextLotId = Number(rows[0]?.nextLotId ?? 2);
  const nextDocumentNumber = Number(rows[0]?.nextDocumentNumber ?? 2);
  const nextPurchaseNoteNumber = Number(rows[0]?.nextPurchaseNoteNumber ?? 2);

  return {
    lotId: nextLotId - 1,
    documentNumber: nextDocumentNumber - 1,
    purchaseNoteNumber: nextPurchaseNoteNumber - 1,
  };
};

const reserveItemId = async ({ tx, companyId }) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "ItemSequence" ("companyId", "nextNumber", "updatedAt")
    VALUES (${companyId}, 101, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET
      "nextNumber" = "ItemSequence"."nextNumber" + 1,
      "updatedAt" = NOW()
    RETURNING "nextNumber";
  `;

  return Number(rows[0]?.nextNumber ?? 101) - 1;
};

const resolveDestinationItemMaster = async ({
  tx,
  sourceItemMaster,
  companyId,
  userId,
}) => {
  if (!sourceItemMaster) return null;

  const existing = await tx.itemMaster.findFirst({
    where: {
      companyId,
      itemName: sourceItemMaster.itemName,
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

  if (existing) return existing;

  const itemId = await reserveItemId({ tx, companyId });

  return tx.itemMaster.create({
    data: {
      itemId,
      itemName: sourceItemMaster.itemName,
      itemType: sourceItemMaster.itemType,
      uow: sourceItemMaster.uow,
      uom: sourceItemMaster.uom,
      companyId,
      createdById: userId,
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
};

const createInventoryMovements = async ({
  tx,
  items,
  event,
  fromStatus,
  toStatus,
  documentId,
  documentNo,
  docId,
  documentType = "INVOICE",
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
      docId: item.docId ?? docId,
      companyId: item.companyId,
      departmentId: item.departmentId,
      createdById: userId,
      metadata: metadata ?? undefined,
    })),
  });
};

const invoiceInclude = {
  company: { select: { id: true, name: true, code: true } },
  sourceCompany: { select: { id: true, name: true, code: true, status: true } },
  department: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  account: {
    select: {
      id: true,
      accountName: true,
      accountIndex: true,
      address: true,
      countryIso2: true,
      city: true,
      phone1: true,
      email: true,
      trnNo: true,
      state: { select: { id: true, name: true, code: true } },
    },
  },
  items: {
    orderBy: { createdAt: "asc" },
    include: {
      itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
      inventoryItem: {
        select: {
          id: true,
          itemId: true,
          docId: true,
          lotId: true,
          lotName: true,
          status: true,
          purchaseNote: { select: { id: true, docId: true, purchaseNo: true, docType: true } },
          memo: { select: { id: true, docId: true, memoNo: true, docType: true } },
        },
      },
    },
  },
};

const invoiceReturnInventoryInclude = {
  company: { select: { id: true, name: true, code: true } },
  department: { select: { id: true, name: true } },
  itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
  vendorAccount: { select: { id: true, accountName: true, accountIndex: true } },
  purchaseNote: { select: { id: true, docId: true, purchaseNo: true, purchaseFrom: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
  memo: { select: { id: true, docId: true, memoNo: true, docType: true, docDate: true, status: true, paymentTerm: true, currency: true } },
  invoiceItems: {
    where: {
      invoice: {
        docType: "Invoice",
      },
    },
    orderBy: { createdAt: "desc" },
    take: 1,
    include: {
      invoice: {
        include: invoiceInclude,
      },
    },
  },
};

const mapInvoiceItem = (item) => ({
  id: item.id,
  inventoryItemId: item.inventoryItemId,
  itemMasterId: item.itemMasterId,
  itemId: item.itemId,
  lotId: item.lotId,
  itemName: item.itemName,
  itemDescription: item.itemDescription,
  quantity: item.quantity,
  unitPrice: numberValue(item.unitPrice),
  totalAmount: numberValue(item.totalAmount),
  weight: numberValue(item.weight),
  labAccountName: item.labAccountName,
  certificateNo: item.certificateNo,
  parcelOrStone: item.parcelOrStone,
  remark: item.remark,
  itemMaster: item.itemMaster,
  inventoryItem: item.inventoryItem,
  ...sourceDocumentSummary(item),
});

const mapInvoice = (invoice) => ({
  id: invoice.id,
  docId: invoice.items?.[0]?.inventoryItem?.docId ?? invoice.docId,
  invoiceNo: invoice.invoiceNo,
  docType: invoice.docType,
  invoiceType: invoice.invoiceType,
  invoiceTypeLabel: invoiceTypeLabel(invoice.invoiceType),
  openDate: normalizeDate(invoice.openDate),
  docDate: normalizeDate(invoice.docDate),
  referenceDocNo: invoice.referenceDocNo,
  docQty: invoice.docQty,
  docWeight: numberValue(invoice.docWeight),
  subtotalAmount: numberValue(invoice.subtotalAmount),
  totalAmount: numberValue(invoice.totalAmount),
  balanceAmount: numberValue(invoice.balanceAmount),
  currency: invoice.currency,
  notes: invoice.notes,
  status: invoice.status,
  createdAt: normalizeDate(invoice.createdAt),
  company: invoice.company,
  sourceCompany: invoice.sourceCompany,
  department: invoice.department,
  createdBy: invoice.createdBy,
  account: invoice.account,
  items: invoice.items?.map(mapInvoiceItem) ?? undefined,
});

const resolveInvoiceReadScope = async (req) => {
  const departmentId = String(req.query.departmentId ?? "").trim();
  const companyId = String(req.query.companyId ?? "").trim();

  if (departmentId) {
    const canRead = await userHasDepartmentModuleAccess({
      userId: req.user.userId,
      userRole: req.user.role,
      departmentId,
      module: "INVOICE_LIST",
      access: "READ_ONLY",
    });

    return canRead
      ? { where: { departmentId } }
      : { error: ["Invoice access denied", 403] };
  }

  if (!companyId) {
    return { error: ["companyId or departmentId is required", 400] };
  }

  const accessibleDepartmentIds = await getAccessibleDepartmentIds({
    userId: req.user.userId,
    userRole: req.user.role,
    companyId,
    module: "INVOICE_LIST",
    access: "READ_ONLY",
  });

  if (accessibleDepartmentIds.length === 0) {
    return { error: ["Invoice access denied for this company", 403] };
  }

  return { where: { companyId } };
};

const firstInvoiceItem = (invoice) => invoice.items?.[0] ?? null;

const sourceDocumentSummary = (item) => {
  const source = item.inventoryItem?.purchaseNote ?? item.inventoryItem?.memo ?? null;
  if (!source) {
    return {
      sourceDocId: null,
      sourceDocNo: null,
      sourceDocType: null,
    };
  }

  return {
    sourceDocId: item.inventoryItem?.docId ?? source.docId,
    sourceDocNo: source.purchaseNo ?? source.memoNo ?? null,
    sourceDocType: source.docType,
  };
};

const mapInvoiceListItem = (invoice) => {
  const firstItem = firstInvoiceItem(invoice);
  const sourceDocument = firstItem ? sourceDocumentSummary(firstItem) : null;

  return {
    ...mapInvoice(invoice),
    lotId: firstItem?.lotId ?? null,
    sourceDocId: sourceDocument?.sourceDocId ?? null,
    sourceDocNo: sourceDocument?.sourceDocNo ?? null,
    sourceDocType: sourceDocument?.sourceDocType ?? null,
    itemName: firstItem?.itemName ?? "-",
    itemDescription: firstItem?.itemDescription ?? null,
    quantity: firstItem?.quantity ?? invoice.docQty,
    unitPrice: firstItem ? numberValue(firstItem.unitPrice) : 0,
  };
};

const mapInvoiceReturnInventoryItem = (item) => ({
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
  purchaseNote: item.purchaseNote
    ? { ...item.purchaseNote, docDate: normalizeDate(item.purchaseNote.docDate) }
    : null,
  memo: item.memo
    ? { ...item.memo, docDate: normalizeDate(item.memo.docDate) }
    : null,
});

const mapInvoiceReturnCandidate = (item) => ({
  inventoryItem: mapInvoiceReturnInventoryItem(item),
  invoice: item.invoiceItems?.[0]?.invoice
    ? mapInvoiceListItem(item.invoiceItems[0].invoice)
    : null,
});

export const createInvoice = async (req, res) => {
  const result = manualInvoiceSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const account = await resolveInvoiceAccount({
    accountId: data.accountId,
    companyId: department.companyId,
  });
  if (data.invoiceType !== "INTERNAL_INVOICE" && !account) {
    return sendError(res, "Customer account not found for selected company", 404, {
      accountId: ["Select a valid customer account"],
    });
  }

  const sourceCompany = await resolveSourceCompany({
    sourceCompanyId: data.sourceCompanyId,
    currentCompanyId: department.companyId,
  });
  if (data.invoiceType === "INTERNAL_INVOICE" && !sourceCompany) {
    return sendError(res, "Company not found for internal invoice", 404, {
      sourceCompanyId: ["Select a valid company"],
    });
  }

  if (data.invoiceType === "INTERNAL_INVOICE") {
    const destination = await resolveInternalDestinationDepartment({
      sourceCompany,
      destinationDepartmentId: data.destinationDepartmentId,
      userId: req.user.userId,
      userRole: req.user.role,
    });

    if (!destination.department) {
      return sendError(res, destination.errorMessage, 400, destination.fieldErrors);
    }
  }

  if (!(await ensureUniqueReference({ companyId: department.companyId, referenceDocNo: data.referenceDocNo }))) {
    return sendError(res, "Reference Doc No already exists for this company", 409, {
      referenceDocNo: ["Reference Doc No already exists for this company"],
    });
  }

  const lineSubtotal = data.item.quantity * data.item.unitPrice;
  const remark = data.remark ?? data.notes ?? null;
  const totalAmount = lineSubtotal;

  const invoice = await prisma.$transaction(async (tx) => {
    const sequence = await reserveInvoiceSequence({ tx, companyId: department.companyId });
    const invoiceNo = buildInvoiceNo(department.company, sequence.invoiceNumber);

    const created = await tx.invoice.create({
      data: {
        docId: sequence.documentNumber,
        invoiceNo,
        docType: "Invoice",
        invoiceType: data.invoiceType,
        docDate: parseDate(data.docDate),
        referenceDocNo: data.referenceDocNo,
        docQty: data.item.quantity,
        docWeight: 0,
        subtotalAmount: lineSubtotal,
        discountAmount: 0,
        taxAmount: 0,
        totalAmount,
        balanceAmount: totalAmount,
        currency: data.currency ?? "USD",
        notes: remark,
        specialInstructions: null,
        status: data.status,
        companyId: department.companyId,
        departmentId: department.id,
        accountId: account?.id ?? null,
        sourceCompanyId: sourceCompany?.id ?? null,
        createdById: req.user.userId,
        items: {
          create: {
            lotId: data.item.lotId ?? null,
            itemName: data.item.itemName,
            itemDescription: data.item.itemDescription ?? null,
            quantity: data.item.quantity,
            unitPrice: data.item.unitPrice,
            totalAmount: lineSubtotal,
            weight: 0,
          },
        },
      },
      include: invoiceInclude,
    });

    return created;
  });

  return sendSuccess(res, "Invoice created successfully", { invoice: mapInvoice(invoice) }, 201);
};

export const createInvoiceFromInventory = async (req, res) => {
  const result = inventoryInvoiceSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const account = await resolveInvoiceAccount({
    accountId: data.accountId,
    companyId: department.companyId,
  });
  if (data.invoiceType !== "INTERNAL_INVOICE" && !account) {
    return sendError(res, "Customer account not found for selected company", 404, {
      accountId: ["Select a valid customer account"],
    });
  }

  const sourceCompany = await resolveSourceCompany({
    sourceCompanyId: data.sourceCompanyId,
    currentCompanyId: department.companyId,
  });
  if (data.invoiceType === "INTERNAL_INVOICE" && !sourceCompany) {
    return sendError(res, "Company not found for internal invoice", 404, {
      sourceCompanyId: ["Select a valid company"],
    });
  }

  let destinationDepartment = null;
  if (data.invoiceType === "INTERNAL_INVOICE") {
    const destination = await resolveInternalDestinationDepartment({
      sourceCompany,
      destinationDepartmentId: data.destinationDepartmentId,
      userId: req.user.userId,
      userRole: req.user.role,
    });

    if (!destination.department) {
      return sendError(res, destination.errorMessage, 400, destination.fieldErrors);
    }

    destinationDepartment = destination.department;
  }

  if (!(await ensureUniqueReference({ companyId: department.companyId, referenceDocNo: data.referenceDocNo }))) {
    return sendError(res, "Reference Doc No already exists for this company", 409, {
      referenceDocNo: ["Reference Doc No already exists for this company"],
    });
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      departmentId: department.id,
      companyId: department.companyId,
    },
    include: {
      itemMaster: { select: { id: true, itemId: true, itemName: true, itemType: true, uow: true, uom: true } },
      purchaseNote: { select: { id: true, docId: true, purchaseNo: true, docType: true } },
      memo: { select: { id: true, docId: true, memoNo: true, docType: true } },
    },
  });

  if (!inventoryItem) return sendError(res, "Inventory item not found", 404);
  if (
    inventoryItem.status !== "STOCK" ||
    (!inventoryItem.purchaseNoteId && !inventoryItem.returnedFromProductionId)
  ) {
    return sendError(res, "Only available stock items can be invoiced", 400);
  }

  const unitPrice =
    inventoryItem.quantity > 0
      ? numberValue(inventoryItem.totalCost) / inventoryItem.quantity
      : numberValue(inventoryItem.totalCost);
  const totalAmount = numberValue(inventoryItem.totalCost);
  const itemName =
    inventoryItem.itemMaster?.itemName ??
    inventoryItem.lotName ??
    inventoryItem.itemType;
  const itemDescription =
    inventoryItem.remark ??
    `${inventoryItem.lotName} - Lot ${inventoryItem.lotId}`;
  const remark = data.remark ?? data.notes ?? null;

  try {
    const invoice = await prisma.$transaction(async (tx) => {
      const sequence = await reserveInvoiceSequence({
        tx,
        companyId: department.companyId,
      });
      const invoiceNo = buildInvoiceNo(department.company, sequence.invoiceNumber);

      const created = await tx.invoice.create({
        data: {
          docId: sequence.documentNumber,
          invoiceNo,
          docType: "Invoice",
          invoiceType: data.invoiceType,
          docDate: parseDate(data.docDate),
          referenceDocNo: data.referenceDocNo,
          docQty: inventoryItem.quantity,
          docWeight: inventoryItem.weight,
          subtotalAmount: totalAmount,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount,
          balanceAmount: totalAmount,
          currency: data.currency ?? "USD",
          notes: remark,
          status: data.status,
          companyId: department.companyId,
          departmentId: department.id,
          accountId: account?.id ?? null,
          sourceCompanyId: sourceCompany?.id ?? null,
          createdById: req.user.userId,
        },
      });

      await tx.invoiceItem.create({
        data: {
          invoiceId: created.id,
          inventoryItemId: inventoryItem.id,
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
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          departmentId: department.id,
          status: "STOCK",
          ...invoiceStockOriginWhere,
        },
        data: { status: "SOLD" },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      let destinationReceipt = null;
      let destinationInventoryItem = null;

      if (data.invoiceType === "INTERNAL_INVOICE") {
        const destinationSequence = await reserveInternalReceiptSequence({
          tx,
          companyId: sourceCompany.id,
        });
        const destinationPurchaseNo = buildPurchaseNo(
          sourceCompany,
          destinationSequence.purchaseNoteNumber,
        );
        const destinationItemMaster = await resolveDestinationItemMaster({
          tx,
          sourceItemMaster: inventoryItem.itemMaster,
          companyId: sourceCompany.id,
          userId: req.user.userId,
        });

        destinationReceipt = await tx.purchaseNote.create({
          data: {
            docId: destinationSequence.documentNumber,
            purchaseNo: destinationPurchaseNo,
            purchaseFrom: "INTERNAL_PURCHASE",
            docType: "Internal Purchase",
            docDate: parseDate(data.docDate),
            referenceDocNo: `Internal invoice ${created.invoiceNo}`,
            docQty: inventoryItem.quantity,
            docWeight: inventoryItem.weight,
            docGrandTotalPrice: totalAmount,
            mainGrandTotalPrice: totalAmount,
            balanceAmount: 0,
            paymentTerm: null,
            currency: data.currency ?? "USD",
            status: "ACTIVE",
            companyId: sourceCompany.id,
            departmentId: destinationDepartment.id,
            sourceCompanyId: department.companyId,
            createdById: req.user.userId,
          },
        });

        destinationInventoryItem = await tx.inventoryItem.create({
          data: {
            itemId: buildItemId(sourceCompany, destinationSequence.lotId),
            docId: destinationSequence.lotId,
            lotId: destinationSequence.lotId,
            itemMasterId: destinationItemMaster?.id ?? null,
            itemType: destinationItemMaster?.itemType ?? inventoryItem.itemType,
            lotName: inventoryItem.lotName,
            quantity: inventoryItem.quantity,
            weight: inventoryItem.weight,
            totalCost: inventoryItem.totalCost,
            labAccountName: inventoryItem.labAccountName,
            certificateNo: inventoryItem.certificateNo,
            parcelOrStone: inventoryItem.parcelOrStone,
            shape: inventoryItem.shape ?? null,
            color: inventoryItem.color ?? null,
            clarity: inventoryItem.clarity ?? null,
            rap: inventoryItem.rap ?? null,
            mainDiscount: inventoryItem.mainDiscount ?? null,
            docPriceGross: inventoryItem.docPriceGross ?? null,
            totalDocPriceGross: inventoryItem.totalDocPriceGross ?? inventoryItem.totalCost,
            remark: inventoryItem.remark,
            departmentAccountName: destinationDepartment.name,
            locationAccountName: destinationDepartment.name,
            status: "STOCK",
            purchaseNoteId: destinationReceipt.id,
            vendorAccountId: null,
            companyId: sourceCompany.id,
            departmentId: destinationDepartment.id,
            createdById: req.user.userId,
          },
          select: {
            id: true,
            docId: true,
            companyId: true,
            departmentId: true,
            status: true,
          },
        });

        await createInventoryMovements({
          tx,
          items: [destinationInventoryItem],
          event: "PURCHASE_IN",
          fromStatus: null,
          toStatus: "STOCK",
          documentType: "PURCHASE_NOTE",
          documentId: destinationReceipt.id,
          documentNo: destinationReceipt.purchaseNo,
          docId: destinationReceipt.docId,
          userId: req.user.userId,
          metadata: {
            transferType: "INTERNAL_INVOICE",
            sourceInvoiceId: created.id,
            sourceInvoiceNo: created.invoiceNo,
            sourceCompanyId: department.companyId,
            sourceDepartmentId: department.id,
            sourceInventoryItemId: inventoryItem.id,
            sourceLotId: inventoryItem.lotId,
          },
        });
      }

      await createInventoryMovements({
        tx,
        items: [inventoryItem],
        event: "INVOICE_OUT",
        fromStatus: "STOCK",
        toStatus: "SOLD",
        documentId: created.id,
        documentNo: created.invoiceNo,
        docId: created.docId,
        userId: req.user.userId,
        metadata: {
          referenceDocNo: data.referenceDocNo,
          sourcePurchaseNo: inventoryItem.purchaseNote?.purchaseNo ?? null,
          sourceMemoNo: inventoryItem.memo?.memoNo ?? null,
          destinationCompanyId:
            data.invoiceType === "INTERNAL_INVOICE" ? sourceCompany?.id : null,
          destinationDepartmentId:
            data.invoiceType === "INTERNAL_INVOICE"
              ? destinationDepartment?.id
              : null,
          destinationPurchaseNoteId: destinationReceipt?.id ?? null,
          destinationPurchaseNo: destinationReceipt?.purchaseNo ?? null,
          destinationInventoryItemId: destinationInventoryItem?.id ?? null,
        },
      });

      return tx.invoice.findUnique({
        where: { id: created.id },
        include: invoiceInclude,
      });
    });

    return sendSuccess(
      res,
      "Invoice created from inventory successfully",
      { invoice: mapInvoice(invoice) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected inventory item changed before invoice was completed. Refresh and try again.",
        409,
      );
    }

    if (error?.code === "P2002") {
      return sendError(res, "Selected inventory item has already been invoiced", 409);
    }

    throw error;
  }
};

export const getInvoiceReturnItemByLot = async (req, res) => {
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
    module: "NEW_INVOICE_RETURN",
    access: "READ_WRITE",
  });

  if (departmentIds.length === 0) {
    return sendError(res, "Invoice return access denied for this company", 403);
  }

  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      companyId,
      departmentId: { in: departmentIds },
      lotId,
      status: "SOLD",
      invoiceItems: {
        some: {
          invoice: {
            docType: "Invoice",
          },
        },
      },
    },
    include: invoiceReturnInventoryInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Sold invoice item not found for this Lot ID", 404);
  }

  if (!inventoryItem.invoiceItems?.[0]?.invoice) {
    return sendError(res, "Original invoice not found for this Lot ID", 404);
  }

  return sendSuccess(res, "Invoice return item retrieved successfully", {
    invoiceReturnItem: mapInvoiceReturnCandidate(inventoryItem),
  });
};

export const returnInvoiceItem = async (req, res) => {
  const result = invoiceReturnSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const inventoryItem = await prisma.inventoryItem.findFirst({
    where: {
      id: data.inventoryItemId,
      companyId: data.companyId,
      status: "SOLD",
      invoiceItems: {
        some: {
          invoice: {
            docType: "Invoice",
          },
        },
      },
    },
    include: invoiceReturnInventoryInclude,
  });

  if (!inventoryItem) {
    return sendError(res, "Sold invoice item not found", 404);
  }

  const originalInvoice = inventoryItem.invoiceItems?.[0]?.invoice;
  const originalLine = inventoryItem.invoiceItems?.[0];
  if (!originalInvoice || !originalLine) {
    return sendError(res, "Original invoice not found for selected item", 404);
  }

  const canReturn = await userHasDepartmentModuleAccess({
    userId: req.user.userId,
    userRole: req.user.role,
    departmentId: inventoryItem.departmentId,
    module: "NEW_INVOICE_RETURN",
    access: "READ_WRITE",
  });

  if (!canReturn) {
    return sendError(res, "You do not have invoice return access for this item department", 403);
  }

  const referenceDocNo =
    data.referenceDocNo ?? `Invoice Return: ${originalInvoice.invoiceNo}`;
  if (!(await ensureUniqueReference({ companyId: data.companyId, referenceDocNo }))) {
    return sendError(res, "Reference Doc No already exists for this company", 409, {
      referenceDocNo: ["Reference Doc No already exists for this company"],
    });
  }

  const totalAmount = numberValue(originalLine.totalAmount);
  const unitPrice = numberValue(originalLine.unitPrice);
  const weight = numberValue(originalLine.weight);
  const remark = data.notes ?? `Return of invoice ${originalInvoice.invoiceNo}`;

  try {
    const invoiceReturn = await prisma.$transaction(async (tx) => {
      const sequence = await reserveInvoiceSequence({
        tx,
        companyId: data.companyId,
      });
      const invoiceNo = buildInvoiceNo(
        inventoryItem.company,
        sequence.invoiceNumber,
      );

      const created = await tx.invoice.create({
        data: {
          docId: sequence.documentNumber,
          invoiceNo,
          docType: "Invoice Return",
          invoiceType: originalInvoice.invoiceType,
          docDate: parseDate(data.docDate),
          referenceDocNo,
          docQty: originalLine.quantity,
          docWeight: weight,
          subtotalAmount: totalAmount,
          discountAmount: 0,
          taxAmount: 0,
          totalAmount,
          balanceAmount: 0,
          currency: originalInvoice.currency,
          notes: remark,
          specialInstructions: null,
          status: "ACTIVE",
          companyId: data.companyId,
          departmentId: inventoryItem.departmentId,
          accountId: originalInvoice.accountId ?? null,
          sourceCompanyId: originalInvoice.sourceCompanyId ?? null,
          createdById: req.user.userId,
          items: {
            create: {
              inventoryItemId: null,
              itemMasterId: inventoryItem.itemMasterId,
              itemId: inventoryItem.itemId,
              lotId: inventoryItem.lotId,
              itemName: originalLine.itemName,
              itemDescription: originalLine.itemDescription,
              quantity: originalLine.quantity,
              unitPrice,
              totalAmount,
              weight,
              labAccountName: originalLine.labAccountName,
              certificateNo: originalLine.certificateNo,
              parcelOrStone: originalLine.parcelOrStone,
              remark,
            },
          },
        },
      });

      const updateResult = await tx.inventoryItem.updateMany({
        where: {
          id: inventoryItem.id,
          companyId: data.companyId,
          status: "SOLD",
        },
        data: { status: "STOCK" },
      });

      if (updateResult.count !== 1) {
        throw new Error("INVENTORY_ITEM_CHANGED");
      }

      await createInventoryMovements({
        tx,
        items: [inventoryItem],
        event: "INVOICE_RETURN",
        fromStatus: "SOLD",
        toStatus: "STOCK",
        documentId: created.id,
        documentNo: created.invoiceNo,
        docId: created.docId,
        userId: req.user.userId,
        metadata: {
          referenceDocNo,
          originalInvoiceId: originalInvoice.id,
          originalInvoiceNo: originalInvoice.invoiceNo,
          lotId: inventoryItem.lotId,
        },
      });

      return tx.invoice.findUnique({
        where: { id: created.id },
        include: invoiceInclude,
      });
    });

    return sendSuccess(
      res,
      "Invoice return created successfully",
      { invoice: mapInvoice(invoiceReturn) },
      201,
    );
  } catch (error) {
    if (error?.message === "INVENTORY_ITEM_CHANGED") {
      return sendError(
        res,
        "Selected inventory item changed before invoice return was completed. Refresh and try again.",
        409,
      );
    }

    throw error;
  }
};

export const getInvoices = async (req, res) => {
  const { search } = req.query;
  const scope = await resolveInvoiceReadScope(req);

  if (scope.error) {
    return sendError(res, scope.error[0], scope.error[1]);
  }

  const where = { ...scope.where };
  const searchValue = String(search ?? "").trim();

  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue) ? { docId: Number(searchValue) } : undefined,
      /^\d+$/.test(searchValue)
        ? { items: { some: { inventoryItem: { docId: Number(searchValue) } } } }
        : undefined,
      { invoiceNo: { contains: searchValue, mode: "insensitive" } },
      { referenceDocNo: { contains: searchValue, mode: "insensitive" } },
      { notes: { contains: searchValue, mode: "insensitive" } },
      { department: { name: { contains: searchValue, mode: "insensitive" } } },
      { createdBy: { fullName: { contains: searchValue, mode: "insensitive" } } },
      { createdBy: { email: { contains: searchValue, mode: "insensitive" } } },
      { account: { accountName: { contains: searchValue, mode: "insensitive" } } },
      { sourceCompany: { name: { contains: searchValue, mode: "insensitive" } } },
      { sourceCompany: { code: { contains: searchValue, mode: "insensitive" } } },
      { items: { some: { itemName: { contains: searchValue, mode: "insensitive" } } } },
      { items: { some: { itemDescription: { contains: searchValue, mode: "insensitive" } } } },
    ].filter(Boolean);
  }

  const invoices = await prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: invoiceInclude,
  });

  return sendSuccess(res, "Invoices retrieved successfully", {
    invoices: invoices.map(mapInvoiceListItem),
  });
};

export const getInvoice = async (req, res) => {
  const { id } = req.params;
  const scope = await resolveInvoiceReadScope(req);

  if (scope.error) {
    return sendError(res, scope.error[0], scope.error[1]);
  }

  const invoice = await prisma.invoice.findFirst({
    where: { id, ...scope.where },
    include: invoiceInclude,
  });

  if (!invoice) return sendError(res, "Invoice not found", 404);

  return sendSuccess(res, "Invoice retrieved successfully", {
    invoice: mapInvoice(invoice),
  });
};
