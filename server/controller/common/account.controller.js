import { z } from "zod";

import { createAuditLog } from "../../helper/auditLog.js";
import { sendError, sendSuccess } from "../../helper/response.js";
import prisma from "../../prisma/client.js";

const ACCOUNT_STATUS = ["ACTIVE", "INACTIVE", "PENDING", "CLOSED"];

const emptyToUndefined = (value) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const optionalEmail = () =>
  z.preprocess(
    emptyToUndefined,
    z.string().trim().email("Enter a valid email address").toLowerCase().optional(),
  );

const optionalUuid = () =>
  z.preprocess(emptyToUndefined, z.string().uuid("Invalid ID").optional());

const statusSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  return value.trim().toUpperCase().replace(/\s+/g, "_");
}, z.enum(ACCOUNT_STATUS));

const optionalDateInput = () =>
  z.preprocess(emptyToUndefined, z.string().trim().optional());

const createAccountSchema = z.object({
  accountTypeId: z.string({ required_error: "accountTypeId is required" }).uuid("Invalid account type"),
  accountName: z.string({ required_error: "accountName is required" }).trim().min(2, "accountName must be at least 2 characters"),
  accountLongName: optionalString(),
  accountIndex: optionalString(),
  status: statusSchema.optional().default("ACTIVE"),
  closeDate: optionalDateInput(),
  closeReason: optionalString(),
  address: optionalString(),
  address2: optionalString(),
  countryIso2: z.preprocess(
    emptyToUndefined,
    z.string().trim().length(2, "countryIso2 must be a 2-letter ISO code").toUpperCase().optional(),
  ),
  stateId: optionalUuid(),
  city: optionalString(),
  zipCode: optionalString(),
  phone1: optionalString(),
  phone2: optionalString(),
  email: optionalEmail(),
  website: optionalString(),
  trnNo: optionalString(),
  isTaxable: z.boolean().optional().default(true),
  companyId: optionalUuid(),
  departmentId: optionalUuid(),
  originDepartmentId: optionalUuid(),
});

const updateAccountSchema = createAccountSchema
  .omit({ departmentId: true, originDepartmentId: true, accountIndex: true })
  .partial()
  .extend({
    companyId: optionalUuid(),
    departmentId: optionalUuid(),
  })
  .refine((data) => Object.keys(data).some((key) => !["companyId", "departmentId"].includes(key)), {
    message: "At least one account field is required to update",
  });

const parseDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const accountSelect = {
  id: true,
  accountName: true,
  accountLongName: true,
  accountIndex: true,
  status: true,
  closeDate: true,
  closeReason: true,
  address: true,
  address2: true,
  countryIso2: true,
  stateId: true,
  city: true,
  zipCode: true,
  phone1: true,
  phone2: true,
  email: true,
  website: true,
  trnNo: true,
  isTaxable: true,
  accountTypeId: true,
  companyId: true,
  originDepartmentId: true,
  createdById: true,
  updatedById: true,
  createdAt: true,
  updatedAt: true,
  accountType: { select: { id: true, name: true } },
  state: { select: { id: true, name: true, code: true } },
  company: { select: { id: true, name: true, code: true } },
  originDepartment: { select: { id: true, name: true } },
  createdBy: { select: { id: true, fullName: true, email: true } },
  updatedBy: { select: { id: true, fullName: true, email: true } },
};

const resolveContext = async (req, res, data, existingAccount = null) => {
  if (req.user.role === "ORG_ADMIN") {
    const companyId = data.companyId ?? existingAccount?.companyId;
    if (!companyId) {
      sendError(res, "companyId is required", 400, {
        companyId: ["Select a company"],
      });
      return null;
    }

    if (existingAccount && existingAccount.companyId !== companyId) {
      sendError(res, "Account does not belong to selected company", 403);
      return null;
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, code: true },
    });
    if (!company) {
      sendError(res, "Company not found", 404);
      return null;
    }

    let originDepartmentId = data.originDepartmentId ?? null;
    if (originDepartmentId) {
      const department = await prisma.department.findFirst({
        where: { id: originDepartmentId, companyId },
        select: { id: true },
      });
      if (!department) {
        sendError(res, "Department does not belong to selected company", 400, {
          originDepartmentId: ["Select a valid department"],
        });
        return null;
      }
    }

    return { company, companyId, departmentId: originDepartmentId };
  }

  const departmentId = data.departmentId;
  if (!departmentId) {
    sendError(res, "departmentId is required", 400, {
      departmentId: ["Select a department"],
    });
    return null;
  }

  const department = await prisma.department.findUnique({
    where: { id: departmentId },
    select: {
      id: true,
      companyId: true,
      company: { select: { id: true, name: true, code: true } },
    },
  });

  if (!department) {
    sendError(res, "Department not found", 404);
    return null;
  }

  if (existingAccount && existingAccount.companyId !== department.companyId) {
    sendError(res, "Account does not belong to selected department company", 403);
    return null;
  }

  return {
    company: department.company,
    companyId: department.companyId,
    departmentId: department.id,
  };
};

const resolveCountryAndState = async ({ countryIso2, stateId }) => {
  if (stateId) {
    const state = await prisma.state.findFirst({
      where: {
        id: stateId,
        isActive: true,
        country: { isActive: true },
      },
      select: {
        id: true,
        country: { select: { iso2: true } },
      },
    });

    if (!state) {
      return { error: { field: "stateId", message: "Select a valid state" } };
    }

    if (countryIso2 && state.country.iso2 !== countryIso2) {
      return {
        error: {
          field: "stateId",
          message: "State does not belong to selected country",
        },
      };
    }

    return { countryIso2: state.country.iso2, stateId: state.id };
  }

  if (countryIso2) {
    const country = await prisma.country.findFirst({
      where: { iso2: countryIso2, isActive: true },
      select: { iso2: true },
    });
    if (!country) {
      return { error: { field: "countryIso2", message: "Select a valid country" } };
    }
  }

  return { countryIso2: countryIso2 ?? null, stateId: null };
};

const ensureAccountType = async (accountTypeId) => {
  const accountType = await prisma.accountType.findUnique({
    where: { id: accountTypeId },
    select: { id: true },
  });
  return Boolean(accountType);
};

const ensureUniqueTrn = async ({ companyId, trnNo, excludeAccountId = null }) => {
  if (!trnNo) return true;

  const existing = await prisma.account.findFirst({
    where: {
      companyId,
      trnNo,
      ...(excludeAccountId ? { NOT: { id: excludeAccountId } } : {}),
    },
    select: { id: true },
  });

  return !existing;
};

const buildAccountIndex = async (tx, company) => {
  const rows = await tx.$queryRaw`
    INSERT INTO "AccountSequence" ("companyId", "nextNumber", "updatedAt")
    VALUES (${company.id}, 2, NOW())
    ON CONFLICT ("companyId")
    DO UPDATE SET "nextNumber" = "AccountSequence"."nextNumber" + 1, "updatedAt" = NOW()
    RETURNING "nextNumber";
  `;

  const nextNumber = Number(rows[0]?.nextNumber ?? 2);
  const sequenceNumber = Math.max(1, nextNumber - 1);
  const prefix =
    (company.code || company.name || "ACC")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6) || "ACC";

  return `${prefix}-ACC-${String(sequenceNumber).padStart(6, "0")}`;
};

const buildCreateData = (data, context, geography) => ({
  accountName: data.accountName,
  accountLongName: data.accountLongName ?? null,
  status: data.status,
  closeDate: data.status === "CLOSED" ? parseDate(data.closeDate) : null,
  closeReason: data.status === "CLOSED" ? data.closeReason ?? null : null,
  address: data.address ?? null,
  address2: data.address2 ?? null,
  countryIso2: geography.countryIso2,
  stateId: geography.stateId,
  city: data.city ?? null,
  zipCode: data.zipCode ?? null,
  phone1: data.phone1 ?? null,
  phone2: data.phone2 ?? null,
  email: data.email ?? null,
  website: data.website ?? null,
  trnNo: data.trnNo ?? null,
  isTaxable: data.isTaxable,
  accountTypeId: data.accountTypeId,
  companyId: context.companyId,
  originDepartmentId: context.departmentId,
  createdById: context.actorUserId,
});

const mapUpdateData = (data, geography) => {
  const update = {};

  [
    "accountName",
    "accountLongName",
    "address",
    "address2",
    "city",
    "zipCode",
    "phone1",
    "phone2",
    "email",
    "website",
    "trnNo",
    "isTaxable",
    "accountTypeId",
  ].forEach((key) => {
    if (data[key] !== undefined) update[key] = data[key] ?? null;
  });

  if (data.status !== undefined) {
    update.status = data.status;
    if (data.status !== "CLOSED") {
      update.closeDate = null;
      update.closeReason = null;
    }
  }

  if (data.closeDate !== undefined) update.closeDate = parseDate(data.closeDate);
  if (data.closeReason !== undefined) update.closeReason = data.closeReason ?? null;
  if (geography) {
    update.countryIso2 = geography.countryIso2;
    update.stateId = geography.stateId;
  }

  return update;
};

export const createAccount = async (req, res) => {
  const result = createAccountSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const data = result.data;
  const context = await resolveContext(req, res, data);
  if (!context) return null;

  if (!(await ensureAccountType(data.accountTypeId))) {
    return sendError(res, "Account type not found", 404);
  }

  const geography = await resolveCountryAndState(data);
  if (geography.error) {
    return sendError(res, "Validation failed", 400, {
      [geography.error.field]: [geography.error.message],
    });
  }

  if (!(await ensureUniqueTrn({ companyId: context.companyId, trnNo: data.trnNo }))) {
    return sendError(res, "TRN number already exists for this company", 409, {
      trnNo: ["TRN number already exists for this company"],
    });
  }

  const account = await prisma.$transaction(async (tx) => {
    const accountIndex = await buildAccountIndex(tx, context.company);
    const created = await tx.account.create({
      data: {
        ...buildCreateData(data, { ...context, actorUserId: req.user.userId }, geography),
        accountIndex,
      },
      select: accountSelect,
    });

    await createAuditLog(tx, req.audit, {
      module: "NEW_ACCOUNT",
      action: "CREATE",
      entityType: "ACCOUNT",
      entityId: created.id,
      companyId: context.companyId,
      departmentId: context.departmentId,
      after: created,
      metadata: { accountIndex },
    });

    return created;
  });

  return sendSuccess(res, "Account created successfully", { account }, 201);
};

export const getAccounts = async (req, res) => {
  const { accountTypeId, status, search } = req.query;
  const where = {};

  if (status && ACCOUNT_STATUS.includes(String(status).toUpperCase())) {
    where.status = String(status).toUpperCase();
  }

  if (accountTypeId) {
    where.accountTypeId = String(accountTypeId);
  }

  if (search) {
    const value = String(search).trim();
    where.OR = [
      { accountName: { contains: value, mode: "insensitive" } },
      { accountIndex: { contains: value, mode: "insensitive" } },
      { email: { contains: value, mode: "insensitive" } },
      { phone1: { contains: value, mode: "insensitive" } },
      { trnNo: { contains: value, mode: "insensitive" } },
    ];
  }

  const accounts = await prisma.account.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: accountSelect,
  });

  return sendSuccess(res, "Accounts retrieved successfully", { accounts });
};

export const getAccount = async (req, res) => {
  const { id } = req.params;
  const account = await prisma.account.findUnique({
    where: { id },
    select: accountSelect,
  });

  if (!account) return sendError(res, "Account not found", 404);

  return sendSuccess(res, "Account retrieved successfully", { account });
};

export const updateAccount = async (req, res) => {
  const { id } = req.params;
  const result = updateAccountSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const existing = await prisma.account.findUnique({
    where: { id },
    select: accountSelect,
  });
  if (!existing) return sendError(res, "Account not found", 404);

  const data = result.data;
  const context = await resolveContext(req, res, data, existing);
  if (!context) return null;

  if (data.accountTypeId && !(await ensureAccountType(data.accountTypeId))) {
    return sendError(res, "Account type not found", 404);
  }

  const needsGeographyCheck = data.countryIso2 !== undefined || data.stateId !== undefined;
  const geography = needsGeographyCheck
    ? await resolveCountryAndState({
        countryIso2: data.countryIso2 ?? existing.countryIso2 ?? undefined,
        stateId: data.stateId ?? existing.stateId ?? undefined,
      })
    : null;

  if (geography?.error) {
    return sendError(res, "Validation failed", 400, {
      [geography.error.field]: [geography.error.message],
    });
  }

  if (
    data.trnNo !== undefined &&
    !(await ensureUniqueTrn({
      companyId: context.companyId,
      trnNo: data.trnNo,
      excludeAccountId: id,
    }))
  ) {
    return sendError(res, "TRN number already exists for this company", 409, {
      trnNo: ["TRN number already exists for this company"],
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const account = await tx.account.update({
      where: { id },
      data: {
        ...mapUpdateData(data, geography),
        updatedById: req.user.userId,
      },
      select: accountSelect,
    });

    await createAuditLog(tx, req.audit, {
      module: "ACCOUNT_LIST",
      action: "UPDATE",
      entityType: "ACCOUNT",
      entityId: account.id,
      companyId: context.companyId,
      departmentId: context.departmentId,
      before: existing,
      after: account,
    });

    return account;
  });

  return sendSuccess(res, "Account updated successfully", { account: updated });
};
