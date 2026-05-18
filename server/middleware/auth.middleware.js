import { sendError } from "../helper/response.js";
import { verifyToken } from "../helper/generateToken.js";
import prisma from "../prisma/client.js";
import { normalizePermissions, permissionAllows } from "../config/modules.ts";

export const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return sendError(res, "Authorization token required", 401);
  }

  const token = authHeader.split(" ")[1];

  const decoded = verifyToken(token);
  if (!decoded) return sendError(res, "Invalid or expired token", 401);

  req.user = decoded;
  req.audit = {
    actorUserId: decoded.userId,
    actorRole: decoded.role,
    actorEmail: decoded.email,
    ipAddress: req.ip,
    userAgent: req.get("user-agent") ?? null,
  };
  next();
};

export const authorizeRoles = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return sendError(res, "Access denied", 403);
  }
  next();
};

export const authorizeDepartmentModule =
  ({ module, access = "READ_ONLY", departmentIdFrom = "body" }) =>
  async (req, res, next) => {
    if (!req.user) return sendError(res, "Access denied", 403);
    if (req.user.role === "ORG_ADMIN") return next();

    const departmentId =
      departmentIdFrom === "params"
        ? req.params.departmentId
        : departmentIdFrom === "query"
          ? req.query.departmentId
          : req.body.departmentId;

    if (!departmentId) {
      return sendError(res, "departmentId is required for module access", 400);
    }

    const departmentAccess = await prisma.userDepartmentAccess.findUnique({
      where: {
        userId_departmentId: {
          userId: req.user.userId,
          departmentId: String(departmentId),
        },
      },
      select: { permissions: true },
    });

    if (!departmentAccess) return sendError(res, "Department access denied", 403);

    const permissions = normalizePermissions(departmentAccess.permissions);
    const modulePermission = permissions.find((item) => item.module === module);

    if (!permissionAllows(modulePermission?.permission, access)) {
      return sendError(res, "Module access denied", 403);
    }

    next();
  };
