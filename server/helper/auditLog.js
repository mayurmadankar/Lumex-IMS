import { MODULE_KEYS } from "../config/modules.ts";

const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
  "password",
  "passwordHash",
  "token",
  "accessToken",
  "refreshToken",
  "authorization",
  "cardNumber",
  "bankAccount",
  "iban",
]);

const isObject = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const sanitizeAuditValue = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitizeAuditValue);

  if (isObject(value)) {
    return Object.entries(value).reduce((safe, [key, item]) => {
      if (item === undefined) return safe;
      safe[key] = SENSITIVE_KEYS.has(key) ? REDACTED : sanitizeAuditValue(item);
      return safe;
    }, {});
  }

  return value;
};

export const buildAuditChanges = (before, after) => {
  const safeBefore = sanitizeAuditValue(before);
  const safeAfter = sanitizeAuditValue(after);

  if (!isObject(safeBefore) || !isObject(safeAfter)) {
    return null;
  }

  return Object.keys({ ...safeBefore, ...safeAfter }).reduce((changes, key) => {
    const beforeValue = safeBefore[key] ?? null;
    const afterValue = safeAfter[key] ?? null;

    if (JSON.stringify(beforeValue) !== JSON.stringify(afterValue)) {
      changes[key] = { before: beforeValue, after: afterValue };
    }

    return changes;
  }, {});
};

export const createAuditLog = async (
  tx,
  audit,
  {
    module,
    action,
    entityType,
    entityId,
    companyId,
    departmentId,
    before,
    after,
    changes,
    metadata,
    status = "SUCCESS",
  },
) => {
  if (!audit?.actorUserId || !audit?.actorRole) {
    throw new Error("Audit actor metadata is missing");
  }

  if (!MODULE_KEYS.includes(module)) {
    throw new Error(`Invalid audit module: ${module}`);
  }

  return tx.auditLog.create({
    data: {
      actorUserId: audit.actorUserId,
      actorRole: audit.actorRole,
      actorEmail: audit.actorEmail ?? null,
      companyId: companyId ?? null,
      departmentId: departmentId ?? null,
      module,
      action,
      entityType,
      entityId: entityId ?? null,
      status,
      before: before === undefined ? undefined : sanitizeAuditValue(before),
      after: after === undefined ? undefined : sanitizeAuditValue(after),
      changes:
        changes === undefined
          ? buildAuditChanges(before, after)
          : sanitizeAuditValue(changes),
      metadata: metadata === undefined ? undefined : sanitizeAuditValue(metadata),
      ipAddress: audit.ipAddress ?? null,
      userAgent: audit.userAgent ?? null,
    },
  });
};
