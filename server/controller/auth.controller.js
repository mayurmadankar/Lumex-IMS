import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import prisma from "../prisma/client.js";
import { sendError, sendSuccess } from "../helper/response.js";
import { generateToken } from "../helper/generateToken.js";
import { sendPasswordResetOtpEmail } from "../helper/mail.js";
import { MODULE_KEYS, normalizePermissions, permissionsToMap } from "../config/modules.ts";

const RESET_OTP_EXPIRES_MINUTES = Number(process.env.PASSWORD_RESET_OTP_EXPIRES_MINUTES ?? 10);
const RESET_OTP_MAX_ATTEMPTS = Number(process.env.PASSWORD_RESET_OTP_MAX_ATTEMPTS ?? 5);
const RESET_OTP_RESEND_SECONDS = Number(process.env.PASSWORD_RESET_OTP_RESEND_SECONDS ?? 60);
const RESET_PASSWORD_MIN_LENGTH = Number(process.env.PASSWORD_MIN_LENGTH ?? 8);
const RESET_PASSWORD_MAX_LENGTH = 128;
const FORGOT_PASSWORD_RATE_LIMIT = Number(process.env.FORGOT_PASSWORD_RATE_LIMIT ?? 10);
const FORGOT_PASSWORD_RATE_WINDOW_MINUTES = Number(process.env.FORGOT_PASSWORD_RATE_WINDOW_MINUTES ?? 15);
const RESET_PASSWORD_RATE_LIMIT = Number(process.env.RESET_PASSWORD_RATE_LIMIT ?? 20);
const RESET_PASSWORD_RATE_WINDOW_MINUTES = Number(process.env.RESET_PASSWORD_RATE_WINDOW_MINUTES ?? 15);
const GENERIC_RESET_MESSAGE =
  "If an account exists for this email, a password reset OTP has been sent.";
const INVALID_OTP_MESSAGE = "Invalid or expired OTP";

const rateLimitStore = new Map();

const forgotPasswordSchema = z.object({
  email: z.string({ required_error: "email is required" }).trim().email("Enter a valid email address").toLowerCase(),
});

const resetPasswordSchema = z.object({
  email: z.string({ required_error: "email is required" }).trim().email("Enter a valid email address").toLowerCase(),
  otp: z.string({ required_error: "otp is required" }).trim().regex(/^\d{6}$/, "OTP must be 6 digits"),
  password: z
    .string({ required_error: "password is required" })
    .min(RESET_PASSWORD_MIN_LENGTH, `Password must be at least ${RESET_PASSWORD_MIN_LENGTH} characters`)
    .max(RESET_PASSWORD_MAX_LENGTH, `Password must be at most ${RESET_PASSWORD_MAX_LENGTH} characters`),
});

const consumeRateLimit = ({ key, limit, windowMs }) => {
  const now = Date.now();
  const current = rateLimitStore.get(key);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  if (current.count >= limit) return true;

  current.count += 1;
  return false;
};

const generateOtp = () => crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");

const getClientIp = (req) => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
  return req.ip || "unknown";
};

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

const buildSessionPayload = async (user) => {
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

  return {
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
  };
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

  const sessionPayload = await buildSessionPayload(user);

  return sendSuccess(res, "Login successful", {
    accessToken,
    ...sessionPayload,
  });
};

export const getCurrentSession = async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
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

  if (!user || !user.isActive) {
    return sendError(res, "Session user not found or inactive", 401);
  }

  return sendSuccess(res, "Session refreshed", await buildSessionPayload(user));
};

export const forgotPassword = async (req, res) => {
  const result = forgotPasswordSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { email } = result.data;
  const ip = getClientIp(req);

  if (
    consumeRateLimit({
      key: `forgot-password:${ip}:${email}`,
      limit: FORGOT_PASSWORD_RATE_LIMIT,
      windowMs: FORGOT_PASSWORD_RATE_WINDOW_MINUTES * 60 * 1000,
    })
  ) {
    return sendError(res, "Too many reset requests. Please try again later.", 429);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, fullName: true, email: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return sendSuccess(res, GENERIC_RESET_MESSAGE);
  }

  await prisma.passwordResetOtp.deleteMany({
    where: {
      userId: user.id,
      OR: [{ expiresAt: { lt: new Date() } }, { usedAt: { not: null } }],
    },
  });

  const recentOtp = await prisma.passwordResetOtp.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
      createdAt: {
        gt: new Date(Date.now() - RESET_OTP_RESEND_SECONDS * 1000),
      },
    },
    select: { id: true },
  });

  if (recentOtp) {
    return sendSuccess(res, GENERIC_RESET_MESSAGE);
  }

  const otp = generateOtp();
  const otpHash = await bcrypt.hash(otp, 10);
  const expiresAt = new Date(Date.now() + RESET_OTP_EXPIRES_MINUTES * 60 * 1000);

  const resetOtp = await prisma.$transaction(async (tx) => {
    await tx.passwordResetOtp.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return tx.passwordResetOtp.create({
      data: {
        userId: user.id,
        otpHash,
        expiresAt,
      },
      select: { id: true },
    });
  });

  try {
    await sendPasswordResetOtpEmail({
      to: user.email,
      name: user.fullName,
      otp,
      expiresInMinutes: RESET_OTP_EXPIRES_MINUTES,
      idempotencyKey: `password-reset-otp/${resetOtp.id}`,
    });
  } catch (error) {
    console.error("Failed to send password reset OTP:", error instanceof Error ? error.message : error);
  }

  return sendSuccess(res, GENERIC_RESET_MESSAGE);
};

export const resetPassword = async (req, res) => {
  const result = resetPasswordSchema.safeParse(req.body);
  if (!result.success) {
    return sendError(res, "Validation failed", 400, result.error.flatten().fieldErrors);
  }

  const { email, otp, password } = result.data;
  const ip = getClientIp(req);

  if (
    consumeRateLimit({
      key: `reset-password:${ip}:${email}`,
      limit: RESET_PASSWORD_RATE_LIMIT,
      windowMs: RESET_PASSWORD_RATE_WINDOW_MINUTES * 60 * 1000,
    })
  ) {
    return sendError(res, "Too many reset attempts. Please try again later.", 429);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, isActive: true },
  });

  if (!user || !user.isActive) {
    return sendError(res, INVALID_OTP_MESSAGE, 400);
  }

  const resetOtp = await prisma.passwordResetOtp.findFirst({
    where: {
      userId: user.id,
      usedAt: null,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!resetOtp || resetOtp.expiresAt <= new Date() || resetOtp.attempts >= RESET_OTP_MAX_ATTEMPTS) {
    if (resetOtp?.expiresAt <= new Date()) {
      await prisma.passwordResetOtp.update({
        where: { id: resetOtp.id },
        data: { usedAt: new Date() },
      });
    }

    return sendError(res, INVALID_OTP_MESSAGE, 400);
  }

  const otpMatched = await bcrypt.compare(otp, resetOtp.otpHash);

  if (!otpMatched) {
    await prisma.passwordResetOtp.update({
      where: { id: resetOtp.id },
      data: {
        attempts: { increment: 1 },
        ...(resetOtp.attempts + 1 >= RESET_OTP_MAX_ATTEMPTS && { usedAt: new Date() }),
      },
    });

    return sendError(res, INVALID_OTP_MESSAGE, 400);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.$transaction([
    prisma.user.update({
      where: { id: user.id },
      data: { passwordHash },
    }),
    prisma.passwordResetOtp.update({
      where: { id: resetOtp.id },
      data: { usedAt: new Date() },
    }),
    prisma.passwordResetOtp.deleteMany({
      where: {
        userId: user.id,
        id: { not: resetOtp.id },
      },
    }),
  ]);

  return sendSuccess(res, "Password reset successful");
};
