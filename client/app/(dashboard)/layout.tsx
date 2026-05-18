"use client";

import { Bell, Building, Check, ChevronDown, RefreshCw } from "lucide-react";
import { useEffect, useMemo } from "react";

import AuthGuard from "@/components/guards/auth-guard";
import LogoutButton from "@/components/guards/logout";
import AppSidebar from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { permissionsToMap } from "@/config/modules";
import { ORG_ADMIN_MODULES, USER_MODULES } from "@/config/sidebar-modules";
import { useCurrencyRates } from "@/hooks/useCurrencyRates";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import {
  setSelectedCompanyInAuth,
  setSelectedDepartmentInAuth,
} from "@/store/slices/authSlice";
import { setSelectedCompanyId } from "@/store/slices/companySlice";
import { setPermissions } from "@/store/slices/permissionSlice";

function CurrencyTicker() {
  const currencyConfig = {
    baseCurrency: "USD",
    symbols: ["INR", "AED"],
  };

  const { rates, loading, error, lastUpdated, baseCurrency, refetch } =
    useCurrencyRates({
      baseCurrency: currencyConfig.baseCurrency,
      symbols: currencyConfig.symbols,
    });

  if (error) {
    return (
      <button
        onClick={refetch}
        className="flex items-center gap-1 text-[10px] text-rose-500 hover:underline"
      >
        <RefreshCw className="h-3 w-3" />
        Retry
      </button>
    );
  }

  if (loading) {
    return (
      <div className="hidden items-center gap-2 md:flex">
        {[baseCurrency, "DATE", ...currencyConfig.symbols].map((currency) => (
          <div
            key={currency}
            className="h-[22px] w-24 animate-pulse rounded-full bg-muted"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="hidden items-center gap-2 md:flex">
      <div
        className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1"
        title={`Base Currency - ${baseCurrency}`}
      >
        <span className="mt-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
          Base
        </span>
        <span className="mt-0.5 text-[10px] font-bold text-foreground">
          {baseCurrency}
        </span>
      </div>

      {lastUpdated && (
        <div
          className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1"
          title={`Rates date - ${lastUpdated}`}
        >
          <span className="mt-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
            Date
          </span>
          <span className="mt-0.5 text-[10px] font-mono text-foreground">
            {lastUpdated}
          </span>
        </div>
      )}

      {rates.map((currency) => (
        <div
          key={currency.code}
          title={`Frankfurter - ${lastUpdated}`}
          className="flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1"
        >
          <span className="mt-0.5 text-[10px] font-bold text-muted-foreground">
            {currency.code}
          </span>
          <span className="mt-0.5 text-[10px] font-mono text-foreground">
            {currency.rate}
          </span>
          <span
            className={`mt-0.5 text-[9px] font-bold ${
              currency.up ? "text-emerald-600" : "text-rose-500"
            }`}
          >
            {currency.change}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);

  const isOrgAdmin = user?.role === "ORG_ADMIN";
  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const selectedDepartmentId =
    user?.selectedDepartmentId ?? departmentAccesses[0]?.departmentId ?? null;
  const selectedDepartment = useMemo(
    () =>
      departmentAccesses.find(
        (access) => access.departmentId === selectedDepartmentId,
      ) ?? null,
    [departmentAccesses, selectedDepartmentId],
  );

  useEffect(() => {
    if (!user || isOrgAdmin || user.selectedDepartmentId || !departmentAccesses[0]) {
      return;
    }

    const firstAccess = departmentAccesses[0];
    dispatch(setSelectedDepartmentInAuth(firstAccess.departmentId));
    dispatch(setSelectedCompanyInAuth(firstAccess.companyId));
    dispatch(setSelectedCompanyId(firstAccess.companyId));
    dispatch(setPermissions(permissionsToMap(firstAccess.permissions)));
  }, [departmentAccesses, dispatch, isOrgAdmin, user]);

  const handleDepartmentSelect = (departmentId: string) => {
    const access = departmentAccesses.find(
      (item) => item.departmentId === departmentId,
    );
    if (!access) return;

    dispatch(setSelectedDepartmentInAuth(access.departmentId));
    dispatch(setSelectedCompanyInAuth(access.companyId));
    dispatch(setSelectedCompanyId(access.companyId));
    dispatch(setPermissions(permissionsToMap(access.permissions)));
  };

  const userInitials =
    user?.fullName
      ?.split(" ")
      .filter(Boolean)
      .map((name) => name[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || (isOrgAdmin ? "OA" : "U");

  return (
    <AuthGuard>
      <div className="flex h-screen bg-muted/30">
        <AppSidebar
          title="IMS Workspace"
          subtitle={isOrgAdmin ? "Org Admin" : "User"}
          modules={isOrgAdmin ? ORG_ADMIN_MODULES : USER_MODULES}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex h-16 w-full items-center justify-between gap-4 border-b bg-background px-5">
            <div className="flex items-center gap-3">
              {!isOrgAdmin && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="group flex items-center gap-2 rounded-xl border border-border bg-muted/40 px-3 py-2 outline-none transition-all duration-150 hover:border-border/80 hover:bg-muted/70 focus-visible:ring-2 focus-visible:ring-ring">
                      <div className="flex h-5 w-5 items-center justify-center rounded-md bg-primary/10">
                        <Building className="h-3 w-3 text-primary" />
                      </div>
                      <div className="hidden text-left leading-tight sm:block">
                        <p className="mb-0.5 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                          Department
                        </p>
                        <p className="max-w-[160px] truncate text-[12px] font-semibold text-foreground">
                          {selectedDepartment?.departmentName ?? "No department"}
                        </p>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/60 transition-transform duration-150 group-data-[state=open]:rotate-180" />
                    </button>
                  </DropdownMenuTrigger>

                  <DropdownMenuContent align="start" className="w-64 rounded-xl">
                    <DropdownMenuLabel className="pb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Switch Department
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {departmentAccesses.length === 0 ? (
                      <div className="px-3 py-4 text-center">
                        <p className="text-xs text-muted-foreground">
                          No departments assigned
                        </p>
                      </div>
                    ) : (
                      departmentAccesses.map((access) => {
                        const isActive =
                          access.departmentId === selectedDepartmentId;

                        return (
                          <DropdownMenuItem
                            key={access.id}
                            onClick={() =>
                              handleDepartmentSelect(access.departmentId)
                            }
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg"
                          >
                            <div
                              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                isActive
                                  ? "bg-primary text-primary-foreground"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              <Building className="h-3 w-3" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-semibold">
                                {access.departmentName}
                              </p>
                              <p className="truncate text-[10px] text-muted-foreground">
                                {access.companyName} - {access.country}
                              </p>
                            </div>
                            {isActive && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                            )}
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {!isOrgAdmin && <div className="hidden h-6 w-px bg-border md:block" />}

              <CurrencyTicker />
            </div>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 rounded-xl"
                >
                  <Bell className="h-4 w-4" />
                </Button>
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-background" />
              </div>

              <div className="flex items-center gap-3 rounded-xl border px-3 py-2">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                  {userInitials}
                </div>
                <div className="hidden sm:block">
                  <p className="text-sm font-medium">
                    {user?.fullName || (isOrgAdmin ? "Org Admin" : "User")}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {user?.email || "user@example.com"}
                  </p>
                </div>
              </div>

              <LogoutButton />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
