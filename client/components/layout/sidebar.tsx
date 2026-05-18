"use client";

import { Building2, Menu } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import type { SidebarModuleItem } from "@/config/sidebar-modules";
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

export default function AppSidebar({
  title = "IMS Workspace",
  subtitle = "Workspace",
  modules,
}: AppSidebarProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const isOpen = useAppSelector((state) => state.ui.sidebarOpen);

  return (
    <aside
      className={`border-r bg-background transition-all duration-200 ${
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
      </div>
    </aside>
  );
}
