import { z } from "zod";

import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const UNIT_OF_WEIGHT = ["CARATS", "GRAMS"];
const UNIT_OF_MEASUREMENT = ["PCS", "WEIGHT"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const itemPayloadSchema = z.object({
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
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
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department"),
  search: z.preprocess(emptyToUndefined, z.string().trim().optional()),
});

const resolveDepartmentContext = async (departmentId) =>
  prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      companyId: true,
      company: { select: { id: true, name: true, code: true } },
    },
  });

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

const mapItem = (item) => ({
  id: item.id,
  itemId: item.itemId,
  itemName: item.itemName,
  itemType: item.itemType,
  uow: item.uow,
  uom: item.uom,
  createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : item.createdAt,
  company: item.company,
  createdBy: item.createdBy,
});

export const createItem = async (req, res) => {
  const result = itemPayloadSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const department = await resolveDepartmentContext(data.departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const item = await prisma.$transaction(async (tx) => {
    const itemId = await reserveItemId({ tx, companyId: department.companyId });

    const created = await tx.itemMaster.create({
      data: {
        itemId,
        itemName: data.itemName,
        itemType: data.itemType,
        uow: data.uow,
        uom: data.uom,
        companyId: department.companyId,
        createdById: req.user.userId,
      },
      include: {
        company: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, fullName: true, email: true } },
      },
    });

    return created;
  });

  return sendSuccess(res, "Item created successfully", { item: mapItem(item) }, 201);
};

export const getItems = async (req, res) => {
  const result = itemListQuerySchema.safeParse(req.query);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { departmentId, search } = result.data;
  const department = await resolveDepartmentContext(departmentId);
  if (!department) return sendError(res, "Department not found", 404);

  const where = { companyId: department.companyId };
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
