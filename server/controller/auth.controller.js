import bcrypt from "bcryptjs";
import prisma from "../prisma/client.js";
import { sendError, sendSuccess } from "../helper/response.js";
import { generateToken } from "../helper/generateToken.js";
import { MODULE_KEYS, normalizePermissions, permissionsToMap } from "../config/modules.ts";

const buildOrgAdminPermissionMap = () =>
  MODULE_KEYS.reduce((permissions, module) => {
    permissions[module] = "READ_WRITE";
    return permissions;
  }, {});

const mapDepartmentAccess = (access) => ({
  id: access.id,
  departmentId: access.department.id,
  departmentName: access.department.name,
  country: access.department.country,
  companyId: access.department.company.id,
  companyName: access.department.company.name,
  companyCode: access.department.company.code,
  companyStatus: access.department.company.status,
  permissions: normalizePermissions(access.permissions),
});

const uniqueCompaniesFromAccesses = (accesses, primaryCompany = null) => {
  const companies = new Map();

  if (primaryCompany) {
    companies.set(primaryCompany.id, primaryCompany);
  }

  accesses.forEach((access) => {
    companies.set(access.companyId, {
      id: access.companyId,
      name: access.companyName,
      code: access.companyCode,
      status: access.companyStatus ?? "ACTIVE",
    });
  });

  return [...companies.values()];
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password ) {
    return sendError(res, "Email and password are required", 400);
  }

  const user = await prisma.user.findUnique({
    where: { email: String(email).trim().toLowerCase() },
    include: {
      orgAdminProfile: true,
      company: {
        select: { id: true, name: true, code: true, status: true },
      },
      departmentAccesses: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          permissions: true,
          department: {
            select: {
              id: true,
              name: true,
              country: true,
              company: {
                select: { id: true, name: true, code: true, status: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return sendError(res, "Invalid email or password", 401);
  if (!user.isActive) return sendError(res, "Your account is inactive", 403);

  const passwordMatched = await bcrypt.compare(String(password), user.passwordHash);
  if (!passwordMatched) return sendError(res, "Invalid email or password", 401);

  const accessToken = generateToken({
    userId: user.id,
    email: user.email,
    role: user.role,
  });

  const departmentAccesses = user.departmentAccesses.map(mapDepartmentAccess);

  let accessibleCompanies = [];
  let selectedCompanyId = null;
  let selectedDepartmentId = null;
  let permissions = {};

  if (user.role === "ORG_ADMIN") {
    accessibleCompanies = await prisma.company.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, status: true },
    });
    selectedCompanyId = accessibleCompanies[0]?.id ?? null;
    permissions = buildOrgAdminPermissionMap();
  } else {
    accessibleCompanies = uniqueCompaniesFromAccesses(departmentAccesses, user.company);
    selectedCompanyId =
      (user.companyId && accessibleCompanies.some((company) => company.id === user.companyId)
        ? user.companyId
        : accessibleCompanies[0]?.id) ?? null;

    selectedDepartmentId =
      departmentAccesses.find((access) => access.companyId === selectedCompanyId)?.departmentId ??
      departmentAccesses[0]?.departmentId ??
      null;

    const selectedAccess = departmentAccesses.find(
      (access) => access.departmentId === selectedDepartmentId,
    );
    permissions = selectedAccess ? permissionsToMap(selectedAccess.permissions) : {};
  }

  const accessibleCompanyIds = accessibleCompanies.map((company) => company.id);

  return sendSuccess(res, "Login successful", {
    accessToken,
    accessibleCompanies,
    user: {
      id: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      primaryCompanyId: user.companyId,
      companyId: user.companyId,
      accessibleCompanyIds,
      selectedCompanyId,
      selectedDepartmentId,
      permissions,
      departmentAccesses,
    },
    orgAdminProfile:
      user.role === "ORG_ADMIN" && user.orgAdminProfile
        ? {
            id: user.orgAdminProfile.id,
            billingEmail: user.orgAdminProfile.billingEmail,
            activePlan: user.orgAdminProfile.activePlan,
          }
        : null,
  });
};
