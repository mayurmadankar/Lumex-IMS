import { MODULE_DEFINITIONS } from "@/config/modules";
import type { ModuleGroup, ModuleKey, PermissionLevel } from "@/config/modules";

export type ModuleRegistryItem = {
  key: ModuleKey;
  title: string;
  group: ModuleGroup;
  access: Exclude<PermissionLevel, "NONE">;
  category:
    | "inventory"
    | "production"
    | "purchase"
    | "memo_in"
    | "invoice"
    | "memo_out"
    | "transfer"
    | "accounting";
};

const categoryByGroup: Record<ModuleGroup, ModuleRegistryItem["category"]> = {
  Inventory: "inventory",
  Production: "production",
  Purchase: "purchase",
  "Memo In": "memo_in",
  Invoice: "invoice",
  "Memo Out": "memo_out",
  Transfer: "transfer",
  Accounting: "accounting",
};

export const MODULE_REGISTRY = MODULE_DEFINITIONS.reduce(
  (registry, definition) => {
    registry[definition.key] = {
      key: definition.key,
      title: definition.title,
      group: definition.group,
      access: definition.requiredPermission,
      category: categoryByGroup[definition.group],
    };

    return registry;
  },
  {} as Record<ModuleKey, ModuleRegistryItem>,
);
