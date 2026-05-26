"use client";

import {
  Activity,
  AlertCircle,
  ArrowRightLeft,
  BookOpen,
  ChevronRight,
  FileMinus,
  FilePlus,
  FileText,
  Inbox,
  MapPin,
  Package,
  PlusSquare,
  RotateCcw,
  Send,
  ShoppingCart,
  TrendingUp,
  Truck,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { ElementType } from "react";

import { permissionAllows, permissionsToMap } from "@/config/modules";
import type { ModuleKey, PermissionLevel } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";

type ActionPermission = Exclude<PermissionLevel, "NONE">;
type WorkflowActionKey =
  | "AVAILABLE_COMPANY_STOCK"
  | "TRANSFER_REQUESTS"
  | "INCOMING_TRANSFER_REQUESTS"
  | "MY_TRANSFER_REQUESTS";

type ModuleAction = {
  key: ModuleKey | WorkflowActionKey;
  label: string;
  icon: ElementType;
  required?: ActionPermission;
  isNew?: boolean;
  visibleAlways?: boolean;
};

type Module = {
  id: string;
  title: string;
  abbr: string;
  color: string;
  bgTint: string;
  borderColor: string;
  textAccent: string;
  actions: ModuleAction[];
};

type VisibleModule = Module & {
  actions: ModuleAction[];
};

const modules: Module[] = [
  {
    id: "inventory",
    title: "Inventory",
    abbr: "INV",
    color: "#0891b2",
    bgTint: "bg-cyan-50",
    borderColor: "border-cyan-200",
    textAccent: "text-cyan-700",
    actions: [
      { key: "INVENTORY_LIST", label: "Inventory List", icon: Package, required: "READ_ONLY" },
      { key: "MEMO_IN_INVENTORY", label: "Memo In Inventory", icon: FileText, required: "READ_ONLY" },
    ],
  },
  {
    id: "production",
    title: "Production",
    abbr: "PRD",
    color: "#e11d48",
    bgTint: "bg-rose-50",
    borderColor: "border-rose-200",
    textAccent: "text-rose-700",
    actions: [
      { key: "CHANGE_LOCATION", label: "Change Location", icon: MapPin, required: "READ_WRITE" },
      { key: "SEND_TO_PROCESS", label: "Send to Process", icon: Send, required: "READ_WRITE" },
      { key: "RETURN_PARTS", label: "Return Parts", icon: RotateCcw, required: "READ_WRITE" },
    ],
  },
  {
    id: "purchase",
    title: "Purchase",
    abbr: "PUR",
    color: "#7c3aed",
    bgTint: "bg-violet-50",
    borderColor: "border-violet-200",
    textAccent: "text-violet-700",
    actions: [
      { key: "PURCHASE_NOTE_LIST", label: "Purchase Transactions", icon: ShoppingCart, required: "READ_ONLY" },
      { key: "NEW_PURCHASE_NOTE", label: "New Purchase Note", icon: FilePlus, required: "READ_WRITE", isNew: true },
      { key: "NEW_PURCH_NOTE_RTN", label: "New Purchase Note Return", icon: FileMinus, required: "READ_WRITE" },
    ],
  },
  {
    id: "memo-in",
    title: "Memo In",
    abbr: "MIN",
    color: "#1d4ed8",
    bgTint: "bg-blue-50",
    borderColor: "border-blue-200",
    textAccent: "text-blue-700",
    actions: [
      { key: "MEMO_IN_LIST", label: "Memo In Transactions", icon: FileText, required: "READ_ONLY" },
      { key: "NEW_MEMO_IN", label: "New Memo In", icon: FilePlus, required: "READ_WRITE", isNew: true },
      { key: "MEMO_IN_RETURN", label: "Memo In Return", icon: FileMinus, required: "READ_WRITE" },
    ],
  },
  {
    id: "invoice",
    title: "Invoice",
    abbr: "INV",
    color: "#0f766e",
    bgTint: "bg-teal-50",
    borderColor: "border-teal-200",
    textAccent: "text-teal-700",
    actions: [
      { key: "INVOICE_LIST", label: "Invoice List", icon: FileText, required: "READ_ONLY" },
      { key: "NEW_INVOICE", label: "New Invoice", icon: FilePlus, required: "READ_WRITE", isNew: true },
      { key: "NEW_INVOICE_RETURN", label: "New Invoice Return", icon: FileMinus, required: "READ_WRITE" },
    ],
  },
  {
    id: "memo-out",
    title: "Memo Out",
    abbr: "MOT",
    color: "#c2410c",
    bgTint: "bg-orange-50",
    borderColor: "border-orange-200",
    textAccent: "text-orange-700",
    actions: [
      { key: "MEMO_OUT_LIST", label: "Memo Out List", icon: Truck, required: "READ_ONLY" },
      { key: "NEW_MEMO_OUT", label: "New Memo Out", icon: FilePlus, required: "READ_WRITE", isNew: true },
      { key: "NEW_MEMO_OUT_RETURN", label: "New Memo Out Return", icon: FileMinus, required: "READ_WRITE" },
    ],
  },
  {
    id: "transfer",
    title: "Transfer",
    abbr: "TRF",
    color: "#6d28d9",
    bgTint: "bg-purple-50",
    borderColor: "border-purple-200",
    textAccent: "text-purple-700",
    actions: [
      { key: "AVAILABLE_COMPANY_STOCK", label: "Available Company Stock", icon: Package, visibleAlways: true },
      { key: "TRANSFER_REQUESTS", label: "Transfer Requests", icon: ArrowRightLeft, visibleAlways: true },
      { key: "INCOMING_TRANSFER_REQUESTS", label: "Incoming Requests", icon: Inbox, visibleAlways: true },
      { key: "MY_TRANSFER_REQUESTS", label: "My Requests", icon: Send, visibleAlways: true },
      { key: "TRANSFER_LIST", label: "Transfer List", icon: ArrowRightLeft, required: "READ_ONLY" },
      { key: "NEW_TRANSFER", label: "New Transfer", icon: FilePlus, required: "READ_WRITE", isNew: true },
      { key: "NEW_TRANSFER_RETURN", label: "New Transfer Return", icon: FileMinus, required: "READ_WRITE" },
    ],
  },
  {
    id: "accounting",
    title: "Accounting",
    abbr: "ACC",
    color: "#b45309",
    bgTint: "bg-amber-50",
    borderColor: "border-amber-200",
    textAccent: "text-amber-800",
    actions: [
      { key: "ACCOUNT_LIST", label: "Account List", icon: BookOpen, required: "READ_ONLY" },
      { key: "NEW_ACCOUNT", label: "New Account", icon: PlusSquare, required: "READ_WRITE", isNew: true },
    ],
  },
];

function ModuleCard({
  mod,
  activeActionKey,
  onActionClick,
}: {
  mod: VisibleModule;
  activeActionKey: ModuleAction["key"] | null;
  onActionClick: (action: ModuleAction) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? mod.actions : mod.actions.slice(0, 4);
  const hasMore = mod.actions.length > 4;

  return (
    <div
      className={`flex min-h-[218px] flex-col overflow-hidden rounded-2xl border shadow-sm ${mod.borderColor} ${mod.bgTint}`}
    >
      <div className="flex items-center gap-3 border-b border-black/[0.06] px-5 py-4">
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-black tracking-widest text-white shadow-sm"
          style={{ backgroundColor: mod.color }}
        >
          {mod.abbr}
        </div>
        <p className={`text-base font-bold tracking-tight ${mod.textAccent}`}>
          {mod.title}
        </p>
        <span className="ml-auto text-[10px] font-semibold tabular-nums text-black/20">
          {mod.actions.length}
        </span>
      </div>

      <div className="flex flex-col divide-y divide-black/[0.04]">
        {shown.map((action) => {
          const Icon = action.icon;
          const isActive = activeActionKey === action.key;

          return (
            <button
              key={action.key}
              onClick={() => onActionClick(action)}
              className={`group flex cursor-pointer items-center gap-3 px-5 py-3 text-left transition-colors duration-150 ${
                isActive ? "bg-white" : "bg-white/90 hover:bg-white hover:shadow-inner"
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 text-black/35 transition-colors group-hover:text-black/65" />
              <span className="flex-1 text-[13px] font-medium tracking-wide text-black/65 transition-colors group-hover:text-black/90">
                {action.label}
              </span>
              {action.isNew && (
                <span
                  className="rounded-md px-1.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-white"
                  style={{ backgroundColor: mod.color }}
                >
                  NEW
                </span>
              )}
              <ChevronRight className="h-3 w-3 text-black/20 transition-all group-hover:translate-x-0.5 group-hover:text-black/45" />
            </button>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((value) => !value)}
          className={`cursor-pointer border-t border-black/[0.05] px-5 py-2.5 text-[11px] font-semibold tracking-wide transition-colors hover:bg-white/60 ${mod.textAccent}`}
        >
          {expanded ? "Show less" : `+${mod.actions.length - 4} more actions`}
        </button>
      )}
    </div>
  );
}

export default function UserPage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const [activeAction, setActiveAction] = useState<ModuleAction | null>(null);

  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const selectedDepartmentId =
    user?.selectedDepartmentId ?? departmentAccesses[0]?.departmentId ?? null;
  const selectedAccess = useMemo(
    () =>
      departmentAccesses.find(
        (access) => access.departmentId === selectedDepartmentId,
      ) ?? departmentAccesses[0],
    [departmentAccesses, selectedDepartmentId],
  );

  const permissionMap = useMemo(
    () =>
      selectedAccess
        ? permissionsToMap(selectedAccess.permissions)
        : persistedPermissions,
    [persistedPermissions, selectedAccess],
  );

  const visibleModules = useMemo(
    () =>
      modules
        .map((mod) => ({
          ...mod,
          actions: mod.actions.filter((action) => {
            if (action.visibleAlways) return true;
            return permissionAllows(
              permissionMap[action.key as ModuleKey],
              action.required ?? "READ_ONLY",
            );
          }),
        }))
        .filter((mod) => mod.actions.length > 0),
    [permissionMap],
  );

  const visibleActionKeys = useMemo(
    () =>
      new Set(
        visibleModules.flatMap((mod) => mod.actions.map((action) => action.key)),
      ),
    [visibleModules],
  );
  const effectiveActiveAction =
    activeAction && visibleActionKeys.has(activeAction.key) ? activeAction : null;

  const firstName = user?.fullName?.split(" ").filter(Boolean)[0] ?? "User";
  const totalActions = visibleModules.reduce(
    (count, mod) => count + mod.actions.length,
    0,
  );

  const stats = [
    {
      label: "Company",
      value: selectedAccess?.companyName ?? "-",
      icon: Activity,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      border: "border-emerald-200",
    },
    {
      label: "Actions",
      value: String(totalActions),
      icon: TrendingUp,
      color: "text-blue-600",
      bg: "bg-blue-50",
      border: "border-blue-200",
    },
    {
      label: "Departments",
      value: String(departmentAccesses.length),
      icon: AlertCircle,
      color: "text-amber-600",
      bg: "bg-amber-50",
      border: "border-amber-200",
    },
  ];

  const handleActionClick = (action: ModuleAction) => {
    if (action.key === "INVENTORY_LIST") {
      router.push("/user/inventory/inventory-list");
      return;
    }

    if (action.key === "MEMO_IN_INVENTORY") {
      router.push("/user/inventory/memo-in-inventory");
      return;
    }

    if (action.key === "PURCHASE_NOTE_LIST") {
      router.push("/user/purchase/purchase-notes");
      return;
    }

    if (action.key === "MEMO_IN_LIST") {
      router.push("/user/memo-in/memos");
      return;
    }

    if (action.key === "MEMO_IN_RETURN") {
      router.push("/user/memo-in/new-memo-return");
      return;
    }

    if (action.key === "NEW_MEMO_IN") {
      router.push("/user/memo-in/new-memo");
      return;
    }

    if (action.key === "ACCOUNT_LIST") {
      router.push("/user/accounting/accounts");
      return;
    }

    if (action.key === "NEW_ACCOUNT") {
      router.push("/user/accounting/new-account");
      return;
    }

    if (action.key === "NEW_PURCHASE_NOTE") {
      router.push("/user/purchase/new-purchase-note");
      return;
    }

    if (action.key === "NEW_PURCH_NOTE_RTN") {
      router.push("/user/purchase/new-purchase-return");
      return;
    }

    if (action.key === "CHANGE_LOCATION") {
      router.push("/user/production/change-location");
      return;
    }

    if (action.key === "SEND_TO_PROCESS") {
      router.push("/user/production/send-to-process");
      return;
    }

    if (action.key === "RETURN_PARTS") {
      router.push("/user/production/return-parts");
      return;
    }

    if (action.key === "INVOICE_LIST") {
      router.push("/user/invoice/invoices");
      return;
    }

    if (action.key === "NEW_INVOICE") {
      router.push("/user/invoice/new-invoice");
      return;
    }

    if (action.key === "NEW_INVOICE_RETURN") {
      router.push("/user/invoice/new-invoice-return");
      return;
    }

    if (action.key === "MEMO_OUT_LIST") {
      router.push("/user/memo-out/memos");
      return;
    }

    if (action.key === "NEW_MEMO_OUT") {
      router.push("/user/memo-out/new-memo-out");
      return;
    }

    if (action.key === "NEW_MEMO_OUT_RETURN") {
      router.push("/user/memo-out/new-memo-out-return");
      return;
    }

    if (action.key === "TRANSFER_LIST") {
      router.push("/user/transfer/transfers");
      return;
    }

    if (action.key === "AVAILABLE_COMPANY_STOCK") {
      router.push("/user/transfer/available-stock");
      return;
    }

    if (action.key === "TRANSFER_REQUESTS") {
      router.push("/user/transfer/transfer-requests");
      return;
    }

    if (action.key === "INCOMING_TRANSFER_REQUESTS") {
      router.push("/user/transfer/incoming-requests");
      return;
    }

    if (action.key === "MY_TRANSFER_REQUESTS") {
      router.push("/user/transfer/my-requests");
      return;
    }

    if (action.key === "NEW_TRANSFER") {
      router.push("/user/transfer/new-transfer");
      return;
    }

    if (action.key === "NEW_TRANSFER_RETURN") {
      router.push("/user/transfer/new-transfer-return");
      return;
    }

    setActiveAction(action);
  };

  return (
    <div className="min-h-screen bg-gray-50/80">
      <main className="mx-auto w-full max-w-[1800px] space-y-7 px-5 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="flex-1">
            <p className="mb-0.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Dashboard
            </p>
            <h1 className="text-xl font-black tracking-tight text-foreground">
              Good morning, <span className="text-cyan-600">{firstName}</span>
            </h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {selectedAccess
                ? `${selectedAccess.departmentName} - ${selectedAccess.companyName}`
                : "No department selected"}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className={`flex min-w-32 items-center gap-2 rounded-xl border ${stat.border} ${stat.bg} px-3 py-2`}
                >
                  <Icon className={`h-3.5 w-3.5 ${stat.color}`} />
                  <div className="min-w-0">
                    <p className="text-[9px] font-bold uppercase tracking-widest text-black/30">
                      {stat.label}
                    </p>
                    <p className={`truncate text-xs font-black ${stat.color}`}>
                      {stat.value}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
            Modules
          </p>
          <div className="h-px flex-1 bg-border" />
          <p className="text-[10px] text-muted-foreground">
            {visibleModules.length} active
          </p>
        </div>

        {departmentAccesses.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-6 py-12 text-center text-sm text-muted-foreground">
            No department access has been assigned to this user.
          </div>
        ) : visibleModules.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-white px-6 py-12 text-center text-sm text-muted-foreground">
            This department has no enabled module permissions.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleModules.map((mod) => (
              <ModuleCard
                key={mod.id}
                mod={mod}
                activeActionKey={effectiveActiveAction?.key ?? null}
                onActionClick={handleActionClick}
              />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
