"use client";

import { Building2, Loader2, Mail, Phone, PlusSquare } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getAccounts } from "@/api/services/account.service";
import type { AccountListItem } from "@/api/services/account.service";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";
import { useAppSelector } from "@/store/hooks";

const ACCOUNT_TYPE_ORDER = ["Customer", "Vendor", "Group Customer"];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function StatusPill({ status }: { status: AccountListItem["status"] }) {
  const styles: Record<AccountListItem["status"], string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    INACTIVE: "bg-muted text-muted-foreground ring-border",
    PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
    CLOSED: "bg-rose-50 text-rose-700 ring-rose-200",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ring-1 ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function AccountTable({
  title,
  accounts,
}: {
  title: string;
  accounts: AccountListItem[];
}) {
  return (
    <section className="overflow-hidden rounded-2xl border bg-background">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">{title}</h2>
          <p className="text-xs text-muted-foreground">
            {accounts.length} accounts
          </p>
        </div>
      </div>

      {accounts.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          No accounts in this group.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b bg-muted/30 text-left text-xs text-muted-foreground">
                <th className="px-4 py-3 font-medium">Account</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Origin Department</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium">Location</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((account) => (
                <tr key={account.id} className="border-b last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-semibold">{account.accountName}</div>
                    <div className="text-xs text-muted-foreground">
                      {account.accountIndex ?? "-"}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>{account.company.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {account.originDepartment?.name ?? "Org admin"}
                  </td>
                  <td className="px-4 py-3">
                    <div className="space-y-1 text-xs">
                      {account.email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3 w-3 text-muted-foreground" />
                          {account.email}
                        </div>
                      )}
                      {account.phone1 && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="h-3 w-3 text-muted-foreground" />
                          {account.phone1}
                        </div>
                      )}
                      {!account.email && !account.phone1 ? "-" : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[account.city, account.countryIso2]
                      .filter(Boolean)
                      .join(", ") || "-"}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={account.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDate(account.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function AccountListPage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const [accounts, setAccounts] = useState<AccountListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const departmentAccesses = user?.departmentAccesses ?? [];
  const selectedDepartmentId =
    user?.selectedDepartmentId ?? departmentAccesses[0]?.departmentId ?? null;
  const selectedAccess =
    departmentAccesses.find(
      (access) => access.departmentId === selectedDepartmentId,
    ) ?? departmentAccesses[0];
  const permissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : persistedPermissions;
  const canReadAccounts = permissionAllows(
    permissionMap.ACCOUNT_LIST,
    "READ_ONLY",
  );
  const canCreateAccount = permissionAllows(
    permissionMap.NEW_ACCOUNT,
    "READ_WRITE",
  );

  useEffect(() => {
    if (!canReadAccounts || !selectedDepartmentId) {
      setLoading(false);
      return;
    }

    const loadAccounts = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getAccounts("user", {
          departmentId: selectedDepartmentId,
        });
        setAccounts(response.data.accounts ?? []);
      } catch {
        setError("Failed to load accounts.");
      } finally {
        setLoading(false);
      }
    };

    loadAccounts();
  }, [canReadAccounts, selectedDepartmentId]);

  const filteredAccounts = useMemo(() => {
    const value = search.trim();
    if (!value) return accounts;

    return accounts.filter((account) =>
      matchesTableSearch(
        [
          account.accountName,
          account.accountIndex,
          account.accountType.name,
          account.company.name,
          account.originDepartment?.name,
          account.email,
          account.phone1,
          account.trnNo,
        ],
        value,
      ),
    );
  }, [accounts, search]);
  const { paginatedItems: paginatedAccounts, ...accountPagination } =
    usePagination(filteredAccounts);

  const groupedAccounts = useMemo(() => {
    const groups = new Map<string, AccountListItem[]>();
    paginatedAccounts.forEach((account) => {
      const name = account.accountType.name;
      groups.set(name, [...(groups.get(name) ?? []), account]);
    });

    return [
      ...ACCOUNT_TYPE_ORDER.map(
        (name) => [name, groups.get(name) ?? []] as const,
      ),
      ...[...groups.entries()].filter(
        ([name]) => !ACCOUNT_TYPE_ORDER.includes(name),
      ),
    ];
  }, [paginatedAccounts]);

  if (!canReadAccounts) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view accounts in this department.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto w-full max-w-none space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Accounting
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Account List
            </h1>
            <p className="text-sm text-muted-foreground">
              Accounts available for the selected department company.
            </p>
          </div>

          {canCreateAccount && (
            <Button
              className="rounded-xl"
              onClick={() => router.push("/user/accounting/new-account")}
            >
              <PlusSquare className="h-4 w-4" />
              New Account
            </Button>
          )}
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search by name, code, company, department, email, phone or TRN"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading accounts...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredAccounts.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No accounts found.
          </div>
        ) : (
          <div className="space-y-5">
            {groupedAccounts.map(([title, group]) => (
              <AccountTable key={title} title={title} accounts={group} />
            ))}
            <div className="overflow-hidden rounded-2xl border bg-background">
              <Pagination
                page={accountPagination.page}
                totalPages={accountPagination.totalPages}
                start={accountPagination.start}
                end={accountPagination.end}
                total={accountPagination.total}
                onPageChange={accountPagination.setPage}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
