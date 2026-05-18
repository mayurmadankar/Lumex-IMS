import bcrypt from "bcryptjs";
import prisma from "../../prisma/client.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import {
  buildDefaultPermissions,
  MODULE_KEYS,
  normalizePermissions,
  PERMISSION_LEVELS,
} from "../../config/modules.ts";
import { z } from "zod";

const permissionEntrySchema = z.object({
  module: z.enum(MODULE_KEYS),
  permission: z.enum(PERMISSION_LEVELS),
});

const departmentAccessSchema = z.object({
  departmentId: z
    .string({ required_error: "departmentId is required" })
    .uuid("Invalid department ID"),
  permissions: z.array(permissionEntrySchema).optional(),
});

const createUserSchema = z.object({
  fullName: z
    .string({ required_error: "fullName is required" })
    .trim()
    .min(2, "fullName must be at least 2 characters"),

  email: z
    .string({ required_error: "email is required" })
    .trim()
    .email("Enter a valid email address")
    .toLowerCase(),

  password: z
    .string({ required_error: "password is required" })
    .min(6, "password must be at least 6 characters"),

  companyId: z
    .string({ required_error: "companyId is required" })
    .uuid("Invalid company ID"),

  departmentAccesses: z.array(departmentAccessSchema).optional(),
});

export const createUser = async (req, res) => {
  const result = createUserSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(
      res,
      "Validation failed",
      400,
      result.error.flatten().fieldErrors,
    );
  }

  const { fullName, email, password, companyId, departmentAccesses } =
    result.data;

  if (companyId) {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) return sendError(res, "Company not found", 404);
  }

  // Check duplicate email
  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existing)
    return sendError(res, "A user with this email already exists", 409);

  // Validate all departmentIds exist
  if (departmentAccesses?.length) {
    const departmentIds = departmentAccesses.map((d) => d.departmentId);
    const uniqueDepartmentIds = [...new Set(departmentIds)];

    if (uniqueDepartmentIds.length !== departmentIds.length) {
      return sendError(res, "Duplicate departments are not allowed", 400);
    }

    const foundDepartments = await prisma.department.findMany({
      where: { id: { in: uniqueDepartmentIds } },
      select: { id: true },
    });

    if (foundDepartments.length !== uniqueDepartmentIds.length) {
      return sendError(res, "One or more departments do not exist", 400);
    }
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.create({
    data: {
      fullName,
      email,
      passwordHash,
      role: "USER",
      isActive: true,
      companyId: companyId ?? null,
      departmentAccesses: {
        create:
          departmentAccesses?.map((d) => ({
            departmentId: d.departmentId,
            permissions: d.permissions
              ? normalizePermissions(d.permissions)
              : buildDefaultPermissions(),
          })) ?? [],
      },
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      departmentAccesses: {
        select: {
          id: true,
          permissions: true,
          department: {
            select: {
              id: true,
              name: true,
              company: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  return sendSuccess(res, "User created successfully", { user }, 201);
};

export const getUsers = async (req, res) => {
  const { search, isActive } = req.query;

  const where = { role: "USER" };

  if (isActive !== undefined) {
    where.isActive = isActive === "true";
  }

  if (search) {
    where.OR = [
      { fullName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
    ];
  }

  const users = await prisma.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      company: {
        // ← primary company
        select: { id: true, name: true },
      },
      _count: {
        select: { departmentAccesses: true },
      },
      departmentAccesses: {
        select: {
          department: {
            select: {
              id: true,
              name: true,
              company: {
                select: { id: true, name: true },
              },
            },
          },
        },
      },
    },
  });

  return sendSuccess(res, "Users fetched successfully", { users });
};

export const getUser = async (req, res) => {
  const { id } = req.params;

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      fullName: true,
      email: true,
      role: true,
      isActive: true,
      createdAt: true,
      company: {
        select: { id: true, name: true },
      },
      _count: {
        select: { departmentAccesses: true },
      },
      departmentAccesses: {
        select: {
          id: true,
          permissions: true,
          department: {
            select: {
              id: true,
              name: true,
              country: true,
              company: {
                select: { id: true, name: true, code: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return sendError(res, "User not found", 404);

  return sendSuccess(res, "User fetched successfully", {
    user: {
      ...user,
      departmentAccesses: user.departmentAccesses.map((access) => ({
        ...access,
        permissions: normalizePermissions(access.permissions),
      })),
    },
  });
};

const updateUserSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address").toLowerCase().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field is required to update",
  });

export const updateUser = async (req, res) => {
  const { id } = req.params;
  const result = updateUserSchema.safeParse(req.body);

  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { email, isActive } = result.data;

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) return sendError(res, "User not found", 404);

  if (email) {
    const emailTaken = await prisma.user.findFirst({
      where: { email: email.trim().toLowerCase(), NOT: { id } },
      select: { id: true },
    });
    if (emailTaken) return sendError(res, "Email already in use", 409);
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(email !== undefined && { email: email.trim().toLowerCase() }),
      ...(isActive !== undefined && { isActive }),
    },
    select: {
      id: true,
      fullName: true,
      email: true,
      isActive: true,
      role: true,
    },
  });

  return sendSuccess(res, "User updated successfully", { user });
};

export const getDashboardAnalytics = async (req, res) => {
  const [totalCompanies, totalUsers, totalDepartments] = await Promise.all([
    prisma.company.count(),
    prisma.user.count({ where: { role: "USER" } }),
    prisma.department.count(),
  ]);

  return sendSuccess(res, "Analytics fetched successfully", {
    analytics: {
      totalCompanies,
      totalUsers,
      totalDepartments,
      stockCount: 0, // static for now
    },
  });
};

// // ── Toggle Active ─────────────────────────────────────────────────────────────
// export const toggleUserActive = async (req, res) => {
//   const { id } = req.params;

//   const user = await prisma.user.findUnique({
//     where: { id },
//     select: { id: true, isActive: true },
//   });
//   if (!user) return sendError(res, "User not found", 404);

//   const updated = await prisma.user.update({
//     where: { id },
//     data:  { isActive: !user.isActive },
//     select: { id: true, fullName: true, isActive: true },
//   });

//   return sendSuccess(
//     res,
//     `User ${updated.isActive ? "activated" : "deactivated"} successfully`,
//     { user: updated }
//   );
// };
