export const MODULE_GROUPS = [
  "Inventory",
  "Production",
  "Purchase",
  "Memo In",
  "Invoice",
  "Memo Out",
  "Transfer",
  "Accounting",
] as const;

export const PERMISSION_LEVELS = ["NONE", "READ_ONLY", "READ_WRITE"] as const;

export const MODULE_DEFINITIONS = [
  { key: "INVENTORY_LIST", title: "Inventory List", group: "Inventory", requiredPermission: "READ_ONLY" },
  { key: "MEMO_IN_INVENTORY", title: "Memo In Inventory", group: "Inventory", requiredPermission: "READ_ONLY" },

  { key: "CHANGE_LOCATION", title: "Change Location", group: "Production", requiredPermission: "READ_WRITE" },
  { key: "SEND_TO_PROCESS", title: "Send To Process", group: "Production", requiredPermission: "READ_WRITE" },
  { key: "RETURN_PARTS", title: "Return Parts", group: "Production", requiredPermission: "READ_WRITE" },

  { key: "PURCHASE_NOTE_LIST", title: "Purchase Transactions", group: "Purchase", requiredPermission: "READ_ONLY" },
  { key: "NEW_PURCHASE_NOTE", title: "New Purchase Note", group: "Purchase", requiredPermission: "READ_WRITE" },
  { key: "NEW_PURCH_NOTE_RTN", title: "New Purchase Note Return", group: "Purchase", requiredPermission: "READ_WRITE" },

  { key: "MEMO_IN_LIST", title: "Memo In Transactions", group: "Memo In", requiredPermission: "READ_ONLY" },
  { key: "NEW_MEMO_IN", title: "New Memo In", group: "Memo In", requiredPermission: "READ_WRITE" },
  { key: "MEMO_IN_RETURN", title: "Memo In Return", group: "Memo In", requiredPermission: "READ_WRITE" },

  { key: "INVOICE_LIST", title: "Invoice List", group: "Invoice", requiredPermission: "READ_ONLY" },
  { key: "NEW_INVOICE", title: "New Invoice", group: "Invoice", requiredPermission: "READ_WRITE" },
  { key: "NEW_INVOICE_RETURN", title: "New Invoice Return", group: "Invoice", requiredPermission: "READ_WRITE" },

  { key: "MEMO_OUT_LIST", title: "Memo Out List", group: "Memo Out", requiredPermission: "READ_ONLY" },
  { key: "NEW_MEMO_OUT", title: "New Memo Out", group: "Memo Out", requiredPermission: "READ_WRITE" },
  { key: "NEW_MEMO_OUT_RETURN", title: "New Memo Out Return", group: "Memo Out", requiredPermission: "READ_WRITE" },

  { key: "TRANSFER_LIST", title: "Transfer List", group: "Transfer", requiredPermission: "READ_ONLY" },
  { key: "NEW_TRANSFER", title: "New Transfer", group: "Transfer", requiredPermission: "READ_WRITE" },
  { key: "NEW_TRANSFER_RETURN", title: "New Transfer Return", group: "Transfer", requiredPermission: "READ_WRITE" },

  { key: "ACCOUNT_LIST", title: "Account List", group: "Accounting", requiredPermission: "READ_ONLY" },
  { key: "NEW_ACCOUNT", title: "New Account", group: "Accounting", requiredPermission: "READ_WRITE" },
] as const;

export type ModuleGroup = typeof MODULE_GROUPS[number];
export type ModuleKey = typeof MODULE_DEFINITIONS[number]["key"];
export type ModulePermission = typeof PERMISSION_LEVELS[number];

export type GroupPermission = {
  module: ModuleKey;
  permission: ModulePermission;
};

export const MODULE_KEYS = MODULE_DEFINITIONS.map((module) => module.key);

const permissionRank: Record<ModulePermission, number> = {
  NONE: 0,
  READ_ONLY: 1,
  READ_WRITE: 2,
};

export const buildDefaultPermissions = (): GroupPermission[] =>
  MODULE_DEFINITIONS.map((module) => ({ module: module.key, permission: "NONE" }));

export const normalizePermissions = (rawPermissions: unknown): GroupPermission[] => {
  const normalized = buildDefaultPermissions();
  let parsed: unknown;

  try {
    parsed =
      typeof rawPermissions === "string" ? JSON.parse(rawPermissions) : rawPermissions;
  } catch {
    return normalized;
  }

  if (!Array.isArray(parsed)) return normalized;

  const seenModules = new Set<string>();

  parsed.forEach((item) => {
    const moduleName = item?.module ?? item?.key ?? item?.group;
    const permission = PERMISSION_LEVELS.includes(item?.permission as ModulePermission)
      ? item.permission
      : "NONE";

    const exact = normalized.find((entry) => entry.module === moduleName);
    if (exact) {
      seenModules.add(exact.module);
      exact.permission = permission;
      return;
    }

    if (MODULE_GROUPS.includes(moduleName as ModuleGroup)) {
      normalized
        .filter((entry) => {
          const definition = MODULE_DEFINITIONS.find((def) => def.key === entry.module);
          return definition?.group === moduleName;
        })
        .forEach((entry) => {
          entry.permission = permission;
        });
    }
  });

  if (!seenModules.has("MEMO_IN_INVENTORY")) {
    const inventoryPermission = normalized.find(
      (entry) => entry.module === "INVENTORY_LIST",
    )?.permission;
    const memoInventory = normalized.find(
      (entry) => entry.module === "MEMO_IN_INVENTORY",
    );

    if (memoInventory && inventoryPermission && inventoryPermission !== "NONE") {
      memoInventory.permission = inventoryPermission;
    }
  }

  return normalized;
};

export const permissionsToMap = (rawPermissions: unknown) =>
  normalizePermissions(rawPermissions).reduce<Record<ModuleKey, ModulePermission>>(
    (map, item) => {
      map[item.module] = item.permission;
      return map;
    },
    {} as Record<ModuleKey, ModulePermission>,
  );

export const permissionAllows = (
  actual: ModulePermission | undefined,
  required: Exclude<ModulePermission, "NONE"> = "READ_ONLY",
) => permissionRank[actual ?? "NONE"] >= permissionRank[required];
