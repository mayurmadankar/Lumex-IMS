"use client";

import { Building2, FileText, Menu, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { SidebarModuleItem } from "@/config/sidebar-modules";
import { useDraftRegistry, useOpenRouteTabs } from "@/hooks/use-form-draft";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { toggleSidebar } from "@/store/slices/uiSlice";

type AppSidebarProps = {
  title?: string;
  subtitle?: string;
  modules: SidebarModuleItem[];
};

function isActivePath(pathname: string, href: string) {
  if (href === "/admin" || href === "/user") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

const pathTitleOverrides: Record<string, string> = {
  "/user": "Dashboard",
  "/user/clipboard": "Clipboard",
  "/user/accounting/accounts": "Accounts",
  "/user/accounting/new-account": "New Account",
  "/user/inventory/inventory-list": "Inventory List",
  "/user/inventory/item-list": "Item List",
  "/user/inventory/memo-in-inventory": "Memo In Inventory",
  "/user/invoice/invoices": "Invoices",
  "/user/invoice/new-invoice": "New Invoice",
  "/user/invoice/new-invoice-return": "New Invoice Return",
  "/user/memo-in/memo-returns": "Memo Returns",
  "/user/memo-in/memos": "Memo In Transactions",
  "/user/memo-in/new-memo": "New Memo In",
  "/user/memo-in/new-memo-return": "New Memo Return",
  "/user/memo-out/memos": "Memo Out Transactions",
  "/user/memo-out/new-memo-out": "New Memo Out",
  "/user/memo-out/new-memo-out-return": "New Memo Out Return",
  "/user/production/change-location": "Change Location",
  "/user/production/return-parts": "Return Parts",
  "/user/production/send-to-process": "Send To Process",
  "/user/purchase/new-purchase-note": "New Purchase Note",
  "/user/purchase/new-purchase-return": "New Purchase Return",
  "/user/purchase/purchase-notes": "Purchase Notes",
  "/user/purchase/purchase-returns": "Purchase Returns",
  "/user/transfer/new-transfer": "New Transfer",
  "/user/transfer/new-transfer-return": "New Transfer Return",
  "/user/transfer/transfers": "Transfers",
  "/admin": "Admin Dashboard",
  "/admin/billing": "Billing",
  "/admin/companies": "Companies",
  "/admin/users": "Users",
};

function titleFromPath(pathname: string) {
  if (pathTitleOverrides[pathname]) return pathTitleOverrides[pathname];

  const segments = pathname.split("/").filter(Boolean);
  const lastSegment = segments.at(-1) ?? "dashboard";
  const previousSegment = segments.at(-2);

  if (/^[0-9a-f-]{16,}$/i.test(lastSegment) && previousSegment) {
    return `${formatSegment(previousSegment)} Detail`;
  }

  return formatSegment(lastSegment);
}

function subtitleFromPath(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length <= 1) return "Workspace";
  return formatSegment(segments.slice(1, -1).at(-1) ?? segments[0]);
}

function formatSegment(segment: string) {
  return segment
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function AppSidebar({
  title = "IMS Workspace",
  subtitle = "Workspace",
  modules,
}: AppSidebarProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = useAppSelector((state) => state.ui.sidebarOpen);
  const { drafts, closeDraft } = useDraftRegistry();
  const workspaceHref = modules[0]?.href;
  const routeTab = {
    href: pathname,
    title: titleFromPath(pathname),
    subtitle: subtitleFromPath(pathname),
    enabled: Boolean(
      workspaceHref &&
        (pathname === workspaceHref || pathname.startsWith(`${workspaceHref}/`)),
    ),
  };
  const { tabs, closeTab } = useOpenRouteTabs(routeTab);
  const visibleDrafts = workspaceHref
    ? drafts.filter(
        (draft) =>
          draft.href === workspaceHref ||
          draft.href.startsWith(`${workspaceHref}/`),
      )
    : drafts;
  const draftHrefs = new Set(visibleDrafts.map((draft) => draft.href));
  const visibleTabs = workspaceHref
    ? tabs.filter(
        (tab) =>
          (tab.href === workspaceHref ||
            tab.href.startsWith(`${workspaceHref}/`)) &&
          !draftHrefs.has(tab.href),
      )
    : tabs.filter((tab) => !draftHrefs.has(tab.href));
  const openItemCount = visibleDrafts.length + visibleTabs.length;
  const handleCloseDraft = (storageKey: string, href: string) => {
    closeDraft(storageKey);
    closeTab(href);
  };

  return (
    <aside
      className={`shrink-0 overflow-y-auto border-r bg-background transition-all duration-200 ${
        isOpen ? "w-72" : "w-16"
      }`}
    >
      <div className="flex h-16 items-center justify-between border-b px-4">
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border bg-background shadow-sm">
            <Building2 className="h-5 w-5" />
          </div>

          {isOpen && (
            <div>
              <p className="text-sm font-semibold">{title}</p>
              <p className="text-xs text-muted-foreground">{subtitle}</p>
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="icon"
          onClick={() => dispatch(toggleSidebar())}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </div>

      <div className="p-3">
        <div className="space-y-1">
          {modules.map((item) => {
            const Icon = item.icon;
            const isActive = isActivePath(pathname, item.href);

            return (
              <button
                key={`${item.key}-${item.href}`}
                onClick={() => router.push(item.href)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {isOpen && <span className="text-sm font-medium">{item.title}</span>}
              </button>
            );
          })}
        </div>

        {openItemCount > 0 && (
          <div className="mt-5 border-t pt-4">
            {isOpen ? (
              <>
                <div className="mb-2 flex items-center justify-between px-3">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Open Tabs
                  </p>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                    {openItemCount}
                  </span>
                </div>

                <div className="space-y-1">
                  {visibleDrafts.map((draft) => {
                    const isActive = isActivePath(pathname, draft.href);

                    return (
                      <div
                        key={draft.storageKey}
                        className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => router.push(draft.href)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {draft.title}
                            </span>
                            {draft.subtitle && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {draft.subtitle}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Close draft"
                          onClick={() => handleCloseDraft(draft.storageKey, draft.href)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-80 transition hover:bg-background hover:text-destructive group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                  {visibleTabs.map((tab) => {
                    const isActive = isActivePath(pathname, tab.href);

                    return (
                      <div
                        key={tab.href}
                        className={`group flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "hover:bg-muted"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => router.push(tab.href)}
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        >
                          <FileText className="h-4 w-4 shrink-0" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {tab.title}
                            </span>
                            {tab.subtitle && (
                              <span className="block truncate text-[11px] text-muted-foreground">
                                {tab.subtitle}
                              </span>
                            )}
                          </span>
                        </button>
                        <button
                          type="button"
                          title="Close tab"
                          onClick={() => closeTab(tab.href)}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground opacity-80 transition hover:bg-background hover:text-destructive group-hover:opacity-100"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={() => dispatch(toggleSidebar())}
                className="flex w-full items-center justify-center rounded-xl px-3 py-3 text-muted-foreground hover:bg-muted"
                title={`${openItemCount} open tab${openItemCount === 1 ? "" : "s"}`}
              >
                <FileText className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
