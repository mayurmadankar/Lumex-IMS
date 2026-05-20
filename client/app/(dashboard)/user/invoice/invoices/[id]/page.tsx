"use client";

import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getInvoice } from "@/api/services/invoice.service";
import type { InvoiceItem, InvoiceListItem } from "@/api/services/invoice.service";
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

function sourceDocument(item: InvoiceItem) {
  if (item.sourceDocNo) return item.sourceDocNo;
  if (item.inventoryItem?.purchaseNote) return item.inventoryItem.purchaseNote.purchaseNo;
  if (item.inventoryItem?.memo) return item.inventoryItem.memo.memoNo;
  return "-";
}

function sourceDocumentId(item: InvoiceItem) {
  if (item.sourceDocId) return item.sourceDocId;
  if (item.inventoryItem?.purchaseNote) return item.inventoryItem.purchaseNote.docId;
  if (item.inventoryItem?.memo) return item.inventoryItem.memo.docId;
  return "-";
}

function recipientName(invoice: InvoiceListItem) {
  return invoice.account?.accountName ?? invoice.sourceCompany?.name ?? "-";
}

function recipientDocId(invoice: InvoiceListItem) {
  return invoice.account?.accountIndex ?? invoice.sourceCompany?.code ?? "-";
}

export default function InvoiceDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [invoice, setInvoice] = useState<InvoiceListItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadInvoices = hasCompanyPermission("INVOICE_LIST", "READ_ONLY");

  useEffect(() => {
    if (!canReadInvoices || !currentCompany?.id || !id) {
      setLoading(false);
      return;
    }

    const loadInvoice = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getInvoice("user", id, {
          companyId: currentCompany.id,
        });
        setInvoice(response.data.invoice);
      } catch {
        setError("Failed to load invoice.");
      } finally {
        setLoading(false);
      }
    };

    loadInvoice();
  }, [canReadInvoices, currentCompany?.id, id]);
  const items = useMemo(() => invoice?.items ?? [], [invoice?.items]);
  const {
    paginatedItems: paginatedLineItems,
    ...lineItemPagination
  } = usePagination(items);

  if (!canReadInvoices) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view invoices in this company.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading invoice...
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div className="p-6">
        <Button variant="outline" className="mb-4 h-9 rounded-xl" onClick={() => router.push("/user/invoice/invoices")}>
          <ArrowLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
          {error ?? "Invoice not found."}
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
              Invoice Document
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{invoice.invoiceNo}</h1>
            <p className="text-sm text-muted-foreground">
              Doc ID {invoice.docId} - {invoice.invoiceTypeLabel}
            </p>
          </div>
          <Button variant="outline" className="h-9 rounded-xl" onClick={() => router.push("/user/invoice/invoices")}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <DetailValue label="Company" value={invoice.company.name} />
          <DetailValue label="Department" value={invoice.department.name} />
          <DetailValue
            label="Performed By"
            value={
              invoice.createdBy?.fullName ?? invoice.createdBy?.email ?? "-"
            }
          />
          <DetailValue label="Account / Company" value={recipientName(invoice)} />
          <DetailValue label="Account Doc ID / Company Code" value={recipientDocId(invoice)} />
          <DetailValue label="Status" value={invoice.status} />
          <DetailValue label="Open Date" value={formatDate(invoice.openDate, true)} />
          <DetailValue label="Invoice Date" value={formatDate(invoice.docDate, true)} />
          <DetailValue label="Reference Doc No" value={invoice.referenceDocNo} />
          <DetailValue label="Invoice Type" value={invoice.invoiceTypeLabel} />
          <DetailValue label="Doc Qty" value={invoice.docQty} />
          <DetailValue label="Doc Weight" value={formatNumber(invoice.docWeight, 4)} />
          <DetailValue label="Subtotal" value={formatNumber(invoice.subtotalAmount)} />
          <DetailValue label="Total Amount" value={formatNumber(invoice.totalAmount)} />
          <DetailValue label="Balance Amount" value={formatNumber(invoice.balanceAmount)} />
          <DetailValue label="Currency" value={invoice.currency} />
        </div>

        {items.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No linked line items found for this invoice.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1600px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Item ID</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Item Name</th>
                    <th className="px-3 py-3 font-medium">Description</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 font-medium">Source Doc ID</th>
                    <th className="px-3 py-3 font-medium">Source Doc No</th>
                    <th className="px-3 py-3 text-right font-medium">Unit Price</th>
                    <th className="px-3 py-3 text-right font-medium">Total Amount</th>
                    <th className="px-3 py-3 font-medium">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedLineItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{item.itemId ?? "-"}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">{item.lotId ?? "-"}</td>
                      <td className="px-3 py-3">{item.itemName}</td>
                      <td className="px-3 py-3">{item.itemDescription ?? "-"}</td>
                      <td className="px-3 py-3 text-right">{item.quantity}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatNumber(item.weight, 4)}</td>
                      <td className="px-3 py-3">{item.certificateNo ?? "-"}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">{sourceDocumentId(item)}</td>
                      <td className="px-3 py-3">{sourceDocument(item)}</td>
                      <td className="px-3 py-3 text-right font-semibold">{formatNumber(item.unitPrice)}</td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">{formatNumber(item.totalAmount)}</td>
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

        {invoice.notes && (
          <div className="grid gap-3 md:grid-cols-2">
            <DetailValue label="Remark" value={invoice.notes} />
          </div>
        )}
      </div>
    </div>
  );
}
