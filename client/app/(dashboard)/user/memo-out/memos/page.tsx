"use client";

import { FileMinus, FilePlus, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getMemoOuts } from "@/api/services/memo-out.service";
import type { MemoOutListItem } from "@/api/services/memo-out.service";
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

function StatusPill({ status }: { status: MemoOutListItem["status"] }) {
  const styles: Record<MemoOutListItem["status"], string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    CANCELLED: "bg-rose-50 text-rose-700",
  };

  return (
    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[status]}`}>
      {status}
    </span>
  );
}

function DocTypePill({ type }: { type: string }) {
  const isReturn = type.toLowerCase().includes("return");

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
        isReturn ? "bg-blue-50 text-blue-700" : "bg-orange-50 text-orange-700"
      }`}
    >
      {type}
    </span>
  );
}

function itemName(memoOut: MemoOutListItem) {
  const item = memoOut.inventoryItem;
  if (!item) return "-";
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? item.itemId;
}

function lotId(memoOut: MemoOutListItem) {
  return memoOut.inventoryItem?.lotId ?? "-";
}

function sourceDoc(memoOut: MemoOutListItem) {
  const item = memoOut.inventoryItem;
  const document = item?.purchase ?? item?.purchaseNote ?? item?.memo ?? item?.originMemo;
  if (!document) return "-";
  if ("purchaseNo" in document) return `${document.purchaseNo} (${document.docType})`;
  return `${document.memoNo} (${document.docType})`;
}

export default function MemoOutListPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [memoOuts, setMemoOuts] = useState<MemoOutListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadMemoOuts = hasCompanyPermission("MEMO_OUT_LIST", "READ_ONLY");
  const canCreateMemoOut = hasCompanyPermission("NEW_MEMO_OUT", "READ_WRITE");
  const canReturnMemoOut = hasCompanyPermission("NEW_MEMO_OUT_RETURN", "READ_WRITE");

  useEffect(() => {
    if (!canReadMemoOuts || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadMemoOuts = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getMemoOuts("user", {
          companyId: currentCompany.id,
        });
        setMemoOuts(response.data.memoOuts ?? []);
      } catch {
        setError("Failed to load Memo Out documents.");
      } finally {
        setLoading(false);
      }
    };

    loadMemoOuts();
  }, [canReadMemoOuts, currentCompany?.id]);

  const filteredMemoOuts = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return memoOuts;

    return memoOuts.filter((memoOut) =>
      [
        memoOut.company.name,
        memoOut.company.code,
        memoOut.department.name,
        memoOut.createdBy?.fullName,
        memoOut.createdBy?.email,
        memoOut.memoNo,
        memoOut.docId,
        memoOut.docType,
        memoOut.referenceDocNo,
        memoOut.account?.accountName,
        memoOut.account?.accountIndex,
        memoOut.account?.accountType?.name,
        memoOut.inventoryItem?.itemId,
        memoOut.inventoryItem?.lotId,
        memoOut.inventoryItem?.lotName,
        memoOut.inventoryItem?.certificateNo,
        memoOut.inventoryItem?.itemMaster?.itemName,
        memoOut.inventoryItem?.status,
        memoOut.sourceMemoOut?.memoNo,
        memoOut.status,
      ]
        .filter(Boolean)
        .some((item) => String(item).toLowerCase().includes(value)),
    );
  }, [memoOuts, search]);
  const {
    paginatedItems: paginatedMemoOuts,
    ...memoOutPagination
  } = usePagination(filteredMemoOuts);

  if (!canReadMemoOuts) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view Memo Out documents in this company.
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
              Memo Out
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Memo Out List</h1>
            <p className="text-sm text-muted-foreground">
              {filteredMemoOuts.length} memo out records found
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canReturnMemoOut && (
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() => router.push("/user/memo-out/new-memo-out-return")}
              >
                <FileMinus className="h-4 w-4" />
                New Memo Out Return
              </Button>
            )}

            {canCreateMemoOut && (
              <Button
                className="h-9 rounded-xl"
                onClick={() => router.push("/user/memo-out/new-memo-out")}
              >
                <FilePlus className="h-4 w-4" />
                New Memo Out
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search Memo Out documents"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading Memo Out documents...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredMemoOuts.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No Memo Out documents found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2200px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Performed By</th>
                    <th className="px-3 py-3 font-medium">Doc Type</th>
                    <th className="px-3 py-3 font-medium">Memo Out No</th>
                    <th className="px-3 py-3 font-medium">Doc ID</th>
                    <th className="px-3 py-3 font-medium">Vendor / Customer</th>
                    <th className="px-3 py-3 font-medium">Account Type</th>
                    <th className="px-3 py-3 font-medium">Account Doc ID</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Item</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 text-right font-medium">Total Amount</th>
                    <th className="px-3 py-3 font-medium">Item Status</th>
                    <th className="px-3 py-3 font-medium">Source Document</th>
                    <th className="px-3 py-3 font-medium">Returned Against</th>
                    <th className="px-3 py-3 font-medium">Reference Doc No</th>
                    <th className="px-3 py-3 font-medium">Date Created</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedMemoOuts.map((memoOut) => (
                    <tr key={memoOut.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{memoOut.company.name}</td>
                      <td className="px-3 py-3">{memoOut.department.name}</td>
                      <td className="px-3 py-3">
                        {memoOut.createdBy?.fullName ?? memoOut.createdBy?.email ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        <DocTypePill type={memoOut.docType} />
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {memoOut.memoNo}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {memoOut.docId}
                      </td>
                      <td className="px-3 py-3">{memoOut.account?.accountName ?? "-"}</td>
                      <td className="px-3 py-3">{memoOut.account?.accountType?.name ?? "-"}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {memoOut.account?.accountIndex ?? "-"}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">{lotId(memoOut)}</td>
                      <td className="px-3 py-3">{itemName(memoOut)}</td>
                      <td className="px-3 py-3">{memoOut.inventoryItem?.certificateNo ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{memoOut.docQty}</td>
                      <td className="px-3 py-3 text-right">{formatNumber(memoOut.docWeight, 4)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                        {formatNumber(memoOut.docGrandTotalPrice)}
                      </td>
                      <td className="px-3 py-3">{memoOut.inventoryItem?.status ?? "-"}</td>
                      <td className="px-3 py-3">{sourceDoc(memoOut)}</td>
                      <td className="px-3 py-3">{memoOut.sourceMemoOut?.memoNo ?? "-"}</td>
                      <td className="px-3 py-3">{memoOut.referenceDocNo ?? "-"}</td>
                      <td className="px-3 py-3">{formatDate(memoOut.createdAt)}</td>
                      <td className="px-3 py-3">
                        <StatusPill status={memoOut.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={memoOutPagination.page}
              totalPages={memoOutPagination.totalPages}
              start={memoOutPagination.start}
              end={memoOutPagination.end}
              total={memoOutPagination.total}
              onPageChange={memoOutPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
