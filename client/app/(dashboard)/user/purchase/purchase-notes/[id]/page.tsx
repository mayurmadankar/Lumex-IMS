"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getPurchaseNote } from "@/api/services/purchase.service";
import type {
  PurchaseNoteInventoryItem,
  PurchaseNoteListItem,
} from "@/api/services/purchase.service";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination";
import { useCompanyAccess } from "@/hooks/use-company-access";
import { usePagination } from "@/hooks/use-pagination";

function formatDate(value?: string | null, withTime = false) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(date);
}

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function formatPaymentTerm(value?: number | null) {
  if (!value) return "-";
  return `${value} ${value === 1 ? "Day" : "Days"}`;
}

function itemLabel(item: PurchaseNoteInventoryItem) {
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? "-";
}

function companyLabel(company?: PurchaseNoteInventoryItem["company"]) {
  if (!company) return "-";
  return company.code ? `${company.name} (${company.code})` : company.name;
}

function sourceMemoLabel(note: PurchaseNoteListItem) {
  const sourceMemos = note.sourceMemos ?? [];
  if (sourceMemos.length === 0) return "-";
  return sourceMemos.map((memo) => memo.memoNo).join(", ");
}

function DetailValue({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border bg-background px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 text-sm font-semibold">{value}</div>
    </div>
  );
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

export default function PurchaseNoteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [purchaseNote, setPurchaseNote] = useState<PurchaseNoteListItem | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const docTypeFilter = searchParams.get("docType") ?? undefined;
  const isPurchaseReturnDetail = docTypeFilter === "Purchase Return";
  const canReadPurchaseNotes =
    hasCompanyPermission("PURCHASE_NOTE_LIST", "READ_ONLY") ||
    (isPurchaseReturnDetail &&
      hasCompanyPermission("NEW_PURCH_NOTE_RTN", "READ_WRITE"));

  useEffect(() => {
    if (!canReadPurchaseNotes || !currentCompany?.id || !id) {
      setLoading(false);
      return;
    }

    const loadPurchaseNote = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getPurchaseNote("user", id, {
          companyId: currentCompany.id,
          docType: docTypeFilter,
        });
        setPurchaseNote(response.data.purchaseNote);
      } catch {
        setError("Failed to load purchase document.");
      } finally {
        setLoading(false);
      }
    };

    loadPurchaseNote();
  }, [canReadPurchaseNotes, currentCompany?.id, docTypeFilter, id]);
  const items = useMemo(() => purchaseNote?.items ?? [], [purchaseNote?.items]);
  const {
    paginatedItems: paginatedLineItems,
    ...lineItemPagination
  } = usePagination(items);

  if (!canReadPurchaseNotes) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view purchase documents in this company.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading purchase document...
      </div>
    );
  }

  if (error || !purchaseNote) {
    return (
      <div className="p-6">
        <Button
          variant="outline"
          className="mb-4 h-9 rounded-xl"
          onClick={() => router.push("/user/purchase/purchase-notes")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
          {error ?? "Purchase document not found."}
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
              Purchase Document
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {purchaseNote.purchaseNo}
            </h1>
            <p className="text-sm text-muted-foreground">
              Doc ID {purchaseNote.docId} - {purchaseNote.docType}
            </p>
          </div>
          <Button
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => router.push("/user/purchase/purchase-notes")}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailValue label="Company" value={purchaseNote.company.name} />
          <DetailValue label="Department" value={purchaseNote.department.name} />
          <DetailValue
            label="Performed By"
            value={
              purchaseNote.createdBy?.fullName ??
              purchaseNote.createdBy?.email ??
              "-"
            }
          />
          <DetailValue
            label="Vendor"
            value={purchaseNote.vendorAccount?.accountName ?? "-"}
          />
          <DetailValue label="Doc Status" value={<StatusPill status={purchaseNote.status} />} />
          <DetailValue label="Open Date" value={formatDate(purchaseNote.openDate, true)} />
          <DetailValue label="Doc Date" value={formatDate(purchaseNote.docDate, true)} />
          <DetailValue label="Reference Doc No" value={purchaseNote.referenceDocNo ?? "-"} />
          <DetailValue label="Source Memo" value={sourceMemoLabel(purchaseNote)} />
          <DetailValue label="Doc Qty" value={purchaseNote.docQty} />
          <DetailValue label="Doc Weight" value={formatNumber(purchaseNote.docWeight, 4)} />
          <DetailValue label="Payment Terms" value={formatPaymentTerm(purchaseNote.paymentTerm)} />
          <DetailValue label="Currency" value={purchaseNote.currency} />
          <DetailValue
            label="Doc Grand Total"
            value={formatNumber(purchaseNote.docGrandTotalPrice)}
          />
          <DetailValue
            label="Main Grand Total"
            value={formatNumber(purchaseNote.mainGrandTotalPrice)}
          />
          <DetailValue label="Balance Amount" value={formatNumber(purchaseNote.balanceAmount)} />
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No linked line items found for this purchase document.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1780px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Item ID</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Lot Name</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 font-medium">Lab</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 font-medium">Parcel / Stone</th>
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Vendor</th>
                    <th className="px-3 py-3 font-medium">Source Memo</th>
                    <th className="px-3 py-3 font-medium">Lot Status</th>
                    <th className="px-3 py-3 text-right font-medium">Total Cost</th>
                    <th className="px-3 py-3 font-medium">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLineItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{itemLabel(item)}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {item.lotId}
                      </td>
                      <td className="px-3 py-3">{item.lotName}</td>
                      <td className="px-3 py-3 text-right">{item.quantity}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(item.weight, 4)}
                      </td>
                      <td className="px-3 py-3">{item.labAccountName || "-"}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {item.certificateNo || "-"}
                      </td>
                      <td className="px-3 py-3">
                        {item.parcelOrStone === "PARCEL" ? "Parcel" : "Stone"}
                      </td>
                      <td className="px-3 py-3">{companyLabel(item.company)}</td>
                      <td className="px-3 py-3">
                        {item.vendorAccount?.accountName ?? "-"}
                      </td>
                      <td className="px-3 py-3">{item.memo?.memoNo ?? "-"}</td>
                      <td className="px-3 py-3 font-semibold">{item.status}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(item.totalCost)}
                      </td>
                      <td className="px-3 py-3">{item.remark ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={lineItemPagination.page}
              totalPages={lineItemPagination.totalPages}
              start={lineItemPagination.start}
              end={lineItemPagination.end}
              total={lineItemPagination.total}
              onPageChange={lineItemPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
