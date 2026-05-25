import { z } from "zod";

import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";
import { userCanAccessCompany } from "../../helper/departmentAccess.js";

const UNIT_OF_WEIGHT = ["CARATS", "GRAMS"];
const UNIT_OF_MEASUREMENT = ["PCS", "WEIGHT"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const itemPayloadSchema = z.object({
  itemName: z.string({ required_error: "Item name is required" }).trim().min(1, "Item name is required"),
  itemType: z.string({ required_error: "Item type is required" }).trim().min(1, "Item type is required"),
  uow: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(UNIT_OF_WEIGHT),
  ),
  uom: z.preprocess(
    (value) => (typeof value === "string" ? value.trim().toUpperCase() : value),
    z.enum(UNIT_OF_MEASUREMENT),
  ),
});

const itemListQuerySchema = z.object({
  companyId: z.preprocess(emptyToUndefined, z.string().uuid("Invalid company").optional()),
  departmentId: z.preprocess(emptyToUndefined, z.string().uuid("Invalid department").optional()),
  search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

const itemParamsSchema = z.object({
  id: z.string().uuid("Invalid item"),
});

const requireOrgAdmin = (res, user) => {
  if (user.role === "ORG_ADMIN") return true;
  sendError(res, "Only org admin can manage item masters", 403);
  return false;
};

const ensureItemListAccess = async ({ companyId, departmentId, user }) => {
  if (user.role === "ORG_ADMIN" && !companyId && !departmentId) {
    return { ok: true };
  }

  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) return { error: "Company not found", status: 404 };

    const canAccess = await userCanAccessCompany({
      userId: user.userId,
      userRole: user.role,
      companyId: company.id,
    });
    if (!canAccess) return { error: "Company access denied", status: 403 };

    return { ok: true };
  }

  if (departmentId) {
    const department = await resolveDepartmentContext(departmentId);
    if (!department) return { error: "Department not found", status: 404 };

    const canAccess = await userCanAccessCompany({
      userId: user.userId,
      userRole: user.role,
      companyId: department.companyId,
    });
    if (!canAccess) return { error: "Company access denied", status: 403 };

    return { ok: true };
  }

  return { error: "companyId or departmentId is required", status: 400 };
};

const resolveDepartmentContext = async (departmentId) =>
  prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      companyId: true,
    },
  });

const lockItemMasters = async (tx) =>
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(76234109)`;

const reserveItemId = async ({ tx }) => {
  const rows = await tx.$queryRaw`
    SELECT COALESCE(MAX("itemId"), 99) + 1 AS "nextItemId"
    FROM "ItemMaster";
  `;

  return Number(rows[0]?.nextItemId ?? 100);
};

const mapItem = (item) => ({
  id: item.id,
  itemId: item.itemId,
  itemName: item.itemName,
  itemType: item.itemType,
  uow: item.uow,
  uom: item.uom,
  createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  company: item.company ?? null,
  createdBy: item.createdBy,
});

export const createItem = async (req, res) => {
  if (!requireOrgAdmin(res, req.user)) return;

  const result = itemPayloadSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;

  const item = await prisma.$transaction(async (tx) => {
    await lockItemMasters(tx);

    const existing = await tx.itemMaster.findFirst({
      where: { itemName: { equals: data.itemName, mode: "insensitive" } },
      select: { id: true },
    });
    if (existing) return null;

    const itemId = await reserveItemId({ tx });

    return tx.itemMaster.create({
      data: {
        itemId,
        itemName: data.itemName,
        itemType: data.itemType,
        uow: data.uow,
        uom: data.uom,
        createdById: req.user.userId,
      },
      include: {
        company: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });
  });

  if (!item) {
    return sendError(res, "Item name already exists", 409, {
      itemName: ["Item name already exists"],
    });
  }

  return sendSuccess(res, "Item created successfully", { item: mapItem(item) }, 201);
};

export const updateItem = async (req, res) => {
  if (!requireOrgAdmin(res, req.user)) return;

  const params = itemParamsSchema.safeParse(req.params);
  if (!params.success) {
    return sendError(res, "Validation failed", 400, params.error.flatten().fieldErrors);
  }

  const result = itemPayloadSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;

  const item = await prisma.$transaction(async (tx) => {
    await lockItemMasters(tx);

    const existingItem = await tx.itemMaster.findUnique({
      where: { id: params.data.id },
      select: { id: true },
    });
    if (!existingItem) return { missing: true };

    const duplicate = await tx.itemMaster.findFirst({
      where: {
        id: { not: params.data.id },
        itemName: { equals: data.itemName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (duplicate) return { duplicate: true };

    const updated = await tx.itemMaster.update({
      where: { id: params.data.id },
      data: {
        itemName: data.itemName,
        itemType: data.itemType,
        uow: data.uow,
        uom: data.uom,
      },
      include: {
        company: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return { item: updated };
  });

  if (item.missing) return sendError(res, "Item not found", 404);
  if (item.duplicate) {
    return sendError(res, "Item name already exists", 409, {
      itemName: ["Item name already exists"],
    });
  }

  return sendSuccess(res, "Item updated successfully", { item: mapItem(item.item) });
};

export const deleteItem = async (req, res) => {
  if (!requireOrgAdmin(res, req.user)) return;

  const params = itemParamsSchema.safeParse(req.params);
  if (!params.success) {
    return sendError(res, "Validation failed", 400, params.error.flatten().fieldErrors);
  }

  const item = await prisma.itemMaster.findUnique({
    where: { id: params.data.id },
    select: {
      id: true,
      _count: {
        select: {
          inventoryItems: true,
          invoiceItems: true,
        },
      },
    },
  });

  if (!item) return sendError(res, "Item not found", 404);

  if (item._count.inventoryItems > 0 || item._count.invoiceItems > 0) {
    return sendError(res, "Item is already used and cannot be deleted", 409);
  }

  await prisma.itemMaster.delete({ where: { id: params.data.id } });

  return sendSuccess(res, "Item deleted successfully");
};

export const getItems = async (req, res) => {
  const result = itemListQuerySchema.safeParse(req.query);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { companyId, departmentId, search } = result.data;
  const access = await ensureItemListAccess({
    companyId,
    departmentId,
    user: req.user,
  });
  if (access.error) return sendError(res, access.error, access.status);

  const where = {};
  const searchValue = String(search ?? "").trim();

  if (searchValue) {
    where.OR = [
      /^\d+$/.test(searchValue) ? { itemId: Number(searchValue) } : undefined,
      { itemName: { contains: searchValue, mode: "insensitive" } },
      { itemType: { contains: searchValue, mode: "insensitive" } },
    ].filter(Boolean);
  }

  const items = await prisma.itemMaster.findMany({
    where,
    orderBy: { itemId: "asc" },
    include: {
      company: { select: { id: true, name: true, code: true } },
      createdBy: { select: { id: true, fullName: true, email: true } },
    },
  });

  return sendSuccess(res, "Items retrieved successfully", {
    items: items.map(mapItem),
  });
};
