"use client";

import { FilePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getMemos } from "@/api/services/memo.service";
import type { MemoListItem } from "@/api/services/memo.service";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { useCompanyAccess } from "@/hooks/use-company-access";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";

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

function formatPaymentTerm(value: number | null) {
  if (!value) return "-";
  return `${value} ${value === 1 ? "Day" : "Days"}`;
}

function formatReferenceDocNo(value?: string | null) {
  if (!value) return "-";
  return value.replace(/^Memo Return:\s*/i, "");
}

function itemDocIds(memo: MemoListItem) {
  const ids = [...new Set((memo.items ?? []).map((item) => item.docId).filter(Boolean))].sort(
    (a, b) => a - b,
  );
  if (ids.length === 0) return String(memo.docId);
  if (ids.length === 1) return String(ids[0]);
  const isRange = ids.every((id, index) => index === 0 || id === ids[index - 1] + 1);
  return isRange ? `${ids[0]}-${ids[ids.length - 1]}` : ids.join(", ");
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

export default function MemoListPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [memos, setMemos] = useState<MemoListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadMemos = hasCompanyPermission("MEMO_IN_LIST", "READ_ONLY");
  const canWriteMemos = hasCompanyPermission("NEW_MEMO_IN", "READ_WRITE");

  useEffect(() => {
    if (!canReadMemos || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadMemos = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getMemos("user", {
          companyId: currentCompany.id,
        });
        setMemos(response.data.memos ?? []);
      } catch {
        setError("Failed to load memo history.");
      } finally {
        setLoading(false);
      }
    };

    loadMemos();
  }, [canReadMemos, currentCompany?.id]);

  const filteredMemos = useMemo(() => {
    const value = search.trim();
    if (!value) return memos;

    return memos.filter((memo) =>
      matchesTableSearch(
        [
          memo.company.name,
          memo.company.code,
          memo.department.name,
          memo.createdBy?.fullName,
          memo.createdBy?.email,
          memo.docType,
          itemDocIds(memo),
          memo.memoNo,
          memo.vendorDocId,
          memo.referenceDocNo,
          memo.account.accountName,
          memo.account.accountIndex,
          formatPaymentTerm(memo.paymentTerm),
          memo.currency,
          memo.status,
        ],
        value,
      ),
    );
  }, [memos, search]);
  const { paginatedItems: paginatedMemos, ...memoPagination } =
    usePagination(filteredMemos);

  if (!canReadMemos) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view memo history in this company.
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
              Memo In
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Memo In Transactions
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredMemos.length} memo transactions found
            </p>
          </div>

          {canWriteMemos && (
            <Button
              className="h-9 rounded-xl"
              onClick={() => router.push("/user/memo-in/new-memo")}
            >
              <FilePlus className="h-4 w-4" />
              New Memo
            </Button>
          )}
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search memo history"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading memo history...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredMemos.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No memo transactions found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1800px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Performed By</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Open Date</th>
                    <th className="px-3 py-3 font-medium">Doc ID</th>
                    <th className="px-3 py-3 font-medium">Memo No</th>
                    <th className="px-3 py-3 font-medium">Account</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Reference Doc No</th>
                    <th className="px-3 py-3 font-medium">Vendor Doc ID</th>
                    <th className="px-3 py-3 text-right font-medium">
                      Qty
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      Weight
                    </th>
                    <th className="px-3 py-3 font-medium">Payment Terms</th>
                    <th className="px-3 py-3 font-medium">Currency</th>
                    <th className="px-3 py-3 text-right font-medium">
                      Doc Grand T. Price
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      Main Grand T. Price
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      Balance Amount
                    </th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMemos.map((memo) => (
                    <tr key={memo.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{memo.company.name}</td>
                      <td className="px-3 py-3">{memo.department.name}</td>
                      <td className="px-3 py-3">
                        {memo.createdBy?.fullName ??
                          memo.createdBy?.email ??
                          "-"}
                      </td>
                      <td className="px-3 py-3">{memo.docType}</td>
                      <td className="px-3 py-3">{formatDate(memo.openDate)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(`/user/memo-in/memos/${memo.id}`)
                          }
                        >
                          {itemDocIds(memo)}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(`/user/memo-in/memos/${memo.id}`)
                          }
                        >
                          {memo.memoNo}
                        </button>
                      </td>
                      <td className="px-3 py-3">{memo.account.accountName}</td>
                      <td className="px-3 py-3 text-emerald-600">
                        {formatDate(memo.docDate)}
                      </td>
                      <td className="px-3 py-3">
                        {formatReferenceDocNo(memo.referenceDocNo)}
                      </td>
                      <td className="px-3 py-3">{memo.vendorDocId ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{memo.docQty}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(memo.docWeight, 4)}
                      </td>
                      <td className="px-3 py-3">
                        {formatPaymentTerm(memo.paymentTerm)}
                      </td>
                      <td className="px-3 py-3 font-semibold text-emerald-600">
                        {memo.currency}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                        {formatNumber(memo.docGrandTotalPrice)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-blue-700">
                        {formatNumber(memo.mainGrandTotalPrice)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {formatNumber(memo.balanceAmount)}
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
              page={memoPagination.page}
              totalPages={memoPagination.totalPages}
              start={memoPagination.start}
              end={memoPagination.end}
              total={memoPagination.total}
              onPageChange={memoPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
