import prisma from "../../prisma/client.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import { getCountryIso2 } from "../../helper/validateCountry.js";
import {
  buildDefaultPermissions,
  MODULE_KEYS,
  normalizePermissions,
  PERMISSION_LEVELS,
} from "../../config/modules.ts";
import { z } from "zod";

const createDepartmentSchema = z.object({
  name: z.string({ required_error: "name is required" }).trim().min(2, "name must be at least 2 characters"),

  country: z.string({ required_error: "country is required" }).trim().min(2, "country must be at least 2 characters"),

  description: z.string().trim().optional(),
});

const permissionEntrySchema = z.object({
  module: z.enum(MODULE_KEYS),
  permission: z.enum(PERMISSION_LEVELS),
});

const updateDepartmentPermissionsSchema = z.object({
  permissions: z.array(permissionEntrySchema),
});

const addUserDepartmentSchema = z.object({
  departmentId: z.string({ required_error: "departmentId is required" }).uuid("Invalid department ID"),
});

// const updateDepartmentSchema = createDepartmentSchema
//   .extend({
//     isActive: z.boolean().optional(),
//   })
//   .partial()
//   .refine((data) => Object.keys(data).length > 0, {
//     message: "At least one field is required to update",
//   });

export const createDepartment = async (req, res) => {
  const { companyId } = req.params;

  const result = createDepartmentSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { name, country, description } = result.data;
  const countryIso2 = await getCountryIso2(country);

  if (!countryIso2) {
    return sendError(res, "Country is not available in country master", 400, {
      country: ["Select a valid country"],
    });
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true },
  });
  if (!company) return sendError(res, "Company not found", 404);

  const existing = await prisma.department.findUnique({
    where: { companyId_name: { companyId, name } },
    select: { id: true },
  });

  if (existing) return sendError(res, "A department with this name already exists", 409);

  const department = await prisma.department.create({
    data: { name, country: countryIso2, description, companyId },
  });

  return sendSuccess(res, "Department created successfully", { department }, 201);
};

export const updateDepartmentPermissions = async (req, res) => {
  const { accessId } = req.params;
  const result = updateDepartmentPermissionsSchema.safeParse(req.body);

  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { permissions } = result.data;

  const access = await prisma.userDepartmentAccess.findUnique({
    where: { id: accessId },
    select: { id: true },
  });
  if (!access) return sendError(res, "Department access not found", 404);

  const updated = await prisma.userDepartmentAccess.update({
    where: { id: accessId },
    data: { permissions: normalizePermissions(permissions) },
  });

  return sendSuccess(res, "Permissions updated successfully", { access: updated });
};

export const addUserDepartment = async (req, res) => {
  const { id: userId } = req.params;
  const result = addUserDepartmentSchema.safeParse(req.body);

  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { departmentId } = result.data;

  const [user, department] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true },
    }),
    prisma.department.findUnique({
      where: { id: departmentId },
      select: { id: true },
    }),
  ]);

  if (!user || user.role !== "USER") return sendError(res, "User not found", 404);
  if (!department) return sendError(res, "Department not found", 404);

  const existing = await prisma.userDepartmentAccess.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
  });
  if (existing) return sendError(res, "User already has access to this department", 409);

  const access = await prisma.userDepartmentAccess.create({
    data: {
      userId,
      departmentId,
      permissions: buildDefaultPermissions(),
    },
    select: {
      id: true,
      permissions: true,
      department: {
        select: {
          id: true,
          name: true,
          country: true,
          company: { select: { id: true, name: true } },
        },
      },
    },
  });

  return sendSuccess(res, "Department added successfully", { access }, 201);
};

export const removeUserDepartment = async (req, res) => {
  const { id: userId, departmentId } = req.params;

  const existing = await prisma.userDepartmentAccess.findUnique({
    where: { userId_departmentId: { userId, departmentId } },
    select: { id: true },
  });
  if (!existing) return sendError(res, "Department access not found", 404);

  await prisma.userDepartmentAccess.delete({
    where: { userId_departmentId: { userId, departmentId } },
  });

  return sendSuccess(res, "Department removed successfully", {});
};
