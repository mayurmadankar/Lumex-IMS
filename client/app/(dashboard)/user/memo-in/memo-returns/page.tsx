"use client";

import { Loader2, RotateCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getMemos } from "@/api/services/memo.service";
import type { MemoListItem } from "@/api/services/memo.service";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination";
import { useCompanyAccess } from "@/hooks/use-company-access";
import { usePagination } from "@/hooks/use-pagination";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function StatusPill({ status }: { status: MemoListItem["status"] }) {
  const active = status === "ACTIVE";

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
        active ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
      }`}
    >
      {active ? "Active" : "Cancelled"}
    </span>
  );
}

export default function MemoReturnListPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [memoReturns, setMemoReturns] = useState<MemoListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadMemoReturns =
    hasCompanyPermission("MEMO_IN_RETURN", "READ_WRITE") ||
    hasCompanyPermission("MEMO_IN_LIST", "READ_ONLY");
  const canCreateMemoReturn = hasCompanyPermission(
    "MEMO_IN_RETURN",
    "READ_WRITE",
  );

  useEffect(() => {
    if (!canReadMemoReturns || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadMemoReturns = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getMemos("user", {
          companyId: currentCompany.id,
          docType: "Memo Return",
        });
        setMemoReturns(response.data.memos ?? []);
      } catch {
        setError("Failed to load memo returns.");
      } finally {
        setLoading(false);
      }
    };

    loadMemoReturns();
  }, [canReadMemoReturns, currentCompany?.id]);

  const filteredMemoReturns = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return memoReturns;

    return memoReturns.filter((memo) =>
      [
        memo.company.name,
        memo.company.code,
        memo.department.name,
        memo.createdBy?.fullName,
        memo.createdBy?.email,
        memo.docType,
        memo.docId,
        memo.memoNo,
        memo.referenceDocNo,
        memo.account.accountName,
        memo.account.accountIndex,
        memo.currency,
        memo.status,
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(value)),
      );
  }, [memoReturns, search]);
  const { paginatedItems: paginatedMemoReturns, ...memoReturnPagination } =
    usePagination(filteredMemoReturns);

  if (!canReadMemoReturns) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view memo returns in this company.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memo In
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Memo In Returns
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredMemoReturns.length} return records found
            </p>
          </div>

          {canCreateMemoReturn && (
            <Button
              className="h-9 rounded-xl"
              onClick={() => router.push("/user/memo-in/new-memo-return")}
            >
              <RotateCcw className="h-4 w-4" />
              New Memo Return
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search memo returns"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading memo returns...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredMemoReturns.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No memo returns found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1620px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Performed By</th>
                    <th className="px-3 py-3 font-medium">Doc Type</th>
                    <th className="px-3 py-3 font-medium">Open Date</th>
                    <th className="px-3 py-3 font-medium">Doc ID</th>
                    <th className="px-3 py-3 font-medium">Return No</th>
                    <th className="px-3 py-3 font-medium">Vendor</th>
                    <th className="px-3 py-3 font-medium">Reference Doc No</th>
                    <th className="px-3 py-3 text-right font-medium">Doc Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Doc Weight</th>
                    <th className="px-3 py-3 text-right font-medium">Return Total</th>
                    <th className="px-3 py-3 font-medium">Currency</th>
                    <th className="px-3 py-3 font-medium">Doc Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMemoReturns.map((memo) => (
                    <tr key={memo.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{memo.company.name}</td>
                      <td className="px-3 py-3">{memo.department.name}</td>
                      <td className="px-3 py-3">
                        {memo.createdBy?.fullName ?? memo.createdBy?.email ?? "-"}
                      </td>
                      <td className="px-3 py-3">{memo.docType}</td>
                      <td className="px-3 py-3">{formatDate(memo.openDate)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(
                              `/user/memo-in/memos/${memo.id}?docType=Memo%20Return`,
                            )
                          }
                        >
                          {memo.docId}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(
                              `/user/memo-in/memos/${memo.id}?docType=Memo%20Return`,
                            )
                          }
                        >
                          {memo.memoNo}
                        </button>
                      </td>
                      <td className="px-3 py-3">{memo.account.accountName}</td>
                      <td className="px-3 py-3">{memo.referenceDocNo ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{memo.docQty}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(memo.docWeight, 4)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                        {formatNumber(memo.docGrandTotalPrice)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-emerald-600">
                        {memo.currency}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={memo.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={memoReturnPagination.page}
              totalPages={memoReturnPagination.totalPages}
              start={memoReturnPagination.start}
              end={memoReturnPagination.end}
              total={memoReturnPagination.total}
              onPageChange={memoReturnPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
