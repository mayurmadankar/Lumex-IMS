"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getPurchaseNotes } from "@/api/services/purchase.service";
import type { PurchaseNoteListItem } from "@/api/services/purchase.service";
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

function formatReferenceDocNo(value?: string | null) {
  if (!value) return "-";
  return value.replace(/^Purchase Return:\s*/i, "");
}

function sourceMemoLabel(note: PurchaseNoteListItem) {
  const sourceMemos = note.sourceMemos ?? [];
  if (sourceMemos.length === 0) return "-";
  return sourceMemos.map((memo) => memo.memoNo).join(", ");
}

function StatusPill({ status }: { status: PurchaseNoteListItem["status"] }) {
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

export default function PurchaseReturnListPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [purchaseReturns, setPurchaseReturns] = useState<
    PurchaseNoteListItem[]
  >([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadPurchaseReturns =
    hasCompanyPermission("NEW_PURCH_NOTE_RTN", "READ_WRITE") ||
    hasCompanyPermission("PURCHASE_NOTE_LIST", "READ_ONLY");
  const canCreatePurchaseReturn = hasCompanyPermission(
    "NEW_PURCH_NOTE_RTN",
    "READ_WRITE",
  );

  useEffect(() => {
    if (!canReadPurchaseReturns || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadPurchaseReturns = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getPurchaseNotes("user", {
          companyId: currentCompany.id,
          docType: "Purchase Return",
        });
        setPurchaseReturns(response.data.purchaseNotes ?? []);
      } catch {
        setError("Failed to load purchase returns.");
      } finally {
        setLoading(false);
      }
    };

    loadPurchaseReturns();
  }, [canReadPurchaseReturns, currentCompany?.id]);

  const filteredPurchaseReturns = useMemo(() => {
    const value = search.trim();
    if (!value) return purchaseReturns;

    return purchaseReturns.filter((note) =>
      matchesTableSearch(
        [
          note.company.name,
          note.company.code,
          note.department.name,
          note.docType,
          note.docId,
          note.purchaseNo,
          note.createdBy?.fullName,
          note.createdBy?.email,
          note.vendorAccount?.accountName,
          note.referenceDocNo,
          sourceMemoLabel(note),
          note.currency,
          note.status,
        ],
        value,
      ),
    );
  }, [purchaseReturns, search]);
  const {
    paginatedItems: paginatedPurchaseReturns,
    ...purchaseReturnPagination
  } = usePagination(filteredPurchaseReturns);

  if (!canReadPurchaseReturns) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view purchase returns in this company.
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
              Purchase
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Purchase Returns
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredPurchaseReturns.length} return records found
            </p>
          </div>

          {canCreatePurchaseReturn && (
            <Button
              className="h-9 rounded-xl"
              onClick={() => router.push("/user/purchase/new-purchase-return")}
            >
              <RotateCcw className="h-4 w-4" />
              New Purchase Return
            </Button>
          )}
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search purchase returns"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading purchase returns...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredPurchaseReturns.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No purchase returns found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1700px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Performed By</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Open Date</th>
                    <th className="px-3 py-3 font-medium">Doc ID</th>
                    <th className="px-3 py-3 font-medium">Return No</th>
                    <th className="px-3 py-3 font-medium">Vendor</th>
                    <th className="px-3 py-3 font-medium">Reference Doc No</th>
                    <th className="px-3 py-3 font-medium">Source Memo</th>
                    <th className="px-3 py-3 text-right font-medium">
                      Qty
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      Weight
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      Return Total
                    </th>
                    <th className="px-3 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedPurchaseReturns.map((note) => (
                    <tr key={note.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{note.company.name}</td>
                      <td className="px-3 py-3">{note.department.name}</td>
                      <td className="px-3 py-3">
                        {note.createdBy?.fullName ??
                          note.createdBy?.email ??
                          "-"}
                      </td>
                      <td className="px-3 py-3">{note.docType}</td>
                      <td className="px-3 py-3">{formatDate(note.openDate)}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(
                              `/user/purchase/purchase-notes/${note.id}?docType=Purchase%20Return`,
                            )
                          }
                        >
                          {note.docId}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(
                              `/user/purchase/purchase-notes/${note.id}?docType=Purchase%20Return`,
                            )
                          }
                        >
                          {note.purchaseNo}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        {note.vendorAccount?.accountName ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {formatReferenceDocNo(note.referenceDocNo)}
                      </td>
                      <td className="px-3 py-3">{sourceMemoLabel(note)}</td>
                      <td className="px-3 py-3 text-right">{note.docQty}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(note.docWeight, 4)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                        {formatNumber(note.docGrandTotalPrice)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={note.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={purchaseReturnPagination.page}
              totalPages={purchaseReturnPagination.totalPages}
              start={purchaseReturnPagination.start}
              end={purchaseReturnPagination.end}
              total={purchaseReturnPagination.total}
              onPageChange={purchaseReturnPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
