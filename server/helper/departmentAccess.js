import { normalizePermissions, permissionAllows } from "../config/modules.ts";
import prisma from "../prisma/client.js";

export const accessAllowsModule = (permissions, module, access = "READ_ONLY") => {
  const normalized = normalizePermissions(permissions);
  const modulePermission = normalized.find((item) => item.module === module);
  return permissionAllows(modulePermission?.permission, access);
};

export const userHasDepartmentModuleAccess = async ({
  userId,
  userRole,
  departmentId,
  module,
  access = "READ_ONLY",
}) => {
  if (userRole === "ORG_ADMIN") return true;

  const departmentAccess = await prisma.userDepartmentAccess.findUnique({
    where: {
      userId_departmentId: {
        userId,
        departmentId: String(departmentId),
      },
    },
    select: { permissions: true },
  });

  return departmentAccess
    ? accessAllowsModule(departmentAccess.permissions, module, access)
    : false;
};

export const userHasAnyDepartmentModuleAccess = async ({
  userId,
  userRole,
  departmentId,
  checks = [],
}) => {
  if (userRole === "ORG_ADMIN") return true;
  if (!checks.length) return false;

  const results = await Promise.all(
    checks.map((check) =>
      userHasDepartmentModuleAccess({
        userId,
        userRole,
        departmentId,
        module: check.module,
        access: check.access ?? "READ_ONLY",
      }),
    ),
  );

  return results.some(Boolean);
};

export const getAccessibleDepartmentIds = async ({
  userId,
  userRole,
  companyId,
  module,
  access = "READ_ONLY",
}) => {
  if (!companyId) return [];

  if (userRole === "ORG_ADMIN") {
    const departments = await prisma.department.findMany({
      where: { companyId: String(companyId) },
      select: { id: true },
    });
    return departments.map((department) => department.id);
  }

  const accesses = await prisma.userDepartmentAccess.findMany({
    where: {
      userId,
      department: {
        companyId: String(companyId),
      },
    },
    select: {
      departmentId: true,
      permissions: true,
    },
  });

  return accesses
    .filter((item) => accessAllowsModule(item.permissions, module, access))
    .map((item) => item.departmentId);
};

export const getAccessibleDepartmentIdsForAnyModule = async ({
  userId,
  userRole,
  companyId,
  checks = [],
}) => {
  if (!checks.length) return [];

  const departmentIdGroups = await Promise.all(
    checks.map((check) =>
      getAccessibleDepartmentIds({
        userId,
        userRole,
        companyId,
        module: check.module,
        access: check.access ?? "READ_ONLY",
      }),
    ),
  );

  return [...new Set(departmentIdGroups.flat())];
};

export const userCanAccessCompany = async ({ userId, userRole, companyId }) => {
  if (userRole === "ORG_ADMIN") return true;
  if (!companyId) return false;

  const access = await prisma.userDepartmentAccess.findFirst({
    where: {
      userId,
      department: {
        companyId: String(companyId),
      },
    },
    select: { id: true },
  });

  return Boolean(access);
};
