"use client";

import { Eye, FileMinus, FilePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getInvoices } from "@/api/services/invoice.service";
import type {
  InvoiceListItem,
  InvoiceStatus,
  InvoiceType,
} from "@/api/services/invoice.service";
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

function InvoiceTypePill({ type }: { type: InvoiceType }) {
  const styles: Record<InvoiceType, string> = {
    LOCAL_INVOICE: "bg-emerald-50 text-emerald-700",
    EXPORT_INVOICE: "bg-blue-50 text-blue-700",
    INTERNAL_INVOICE: "bg-amber-50 text-amber-700",
  };

  const labels: Record<InvoiceType, string> = {
    LOCAL_INVOICE: "Local",
    EXPORT_INVOICE: "Export",
    INTERNAL_INVOICE: "Internal",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[type]}`}
    >
      {labels[type]}
    </span>
  );
}

function StatusPill({ status }: { status: InvoiceStatus }) {
  const styles: Record<InvoiceStatus, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PENDING: "bg-amber-50 text-amber-700",
    DRAFT: "bg-slate-100 text-slate-700",
    CANCELLED: "bg-rose-50 text-rose-700",
  };

  return (
    <span
      className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${styles[status]}`}
    >
      {status}
    </span>
  );
}

function accountName(invoice: InvoiceListItem) {
  return invoice.account?.accountName ?? invoice.sourceCompany?.name ?? "-";
}

function accountDocId(invoice: InvoiceListItem) {
  return invoice.account?.accountIndex ?? invoice.sourceCompany?.code ?? "-";
}

function sourceDocId(invoice: InvoiceListItem) {
  return invoice.sourceDocId ?? invoice.items?.[0]?.sourceDocId ?? "-";
}

function lotId(invoice: InvoiceListItem) {
  return invoice.lotId ?? invoice.items?.[0]?.lotId ?? "-";
}

export default function InvoiceListPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const [invoices, setInvoices] = useState<InvoiceListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canReadInvoices = hasCompanyPermission("INVOICE_LIST", "READ_ONLY");
  const canCreateInvoice = hasCompanyPermission("NEW_INVOICE", "READ_WRITE");
  const canCreateInvoiceReturn = hasCompanyPermission(
    "NEW_INVOICE_RETURN",
    "READ_WRITE",
  );

  useEffect(() => {
    if (!canReadInvoices || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadInvoices = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getInvoices("user", {
          companyId: currentCompany.id,
        });
        setInvoices(response.data.invoices ?? []);
      } catch {
        setError("Failed to load invoices.");
      } finally {
        setLoading(false);
      }
    };

    loadInvoices();
  }, [canReadInvoices, currentCompany?.id]);

  const filteredInvoices = useMemo(() => {
    const value = search.trim();
    if (!value) return invoices;

    return invoices.filter((invoice) =>
      matchesTableSearch(
        [
          invoice.company.name,
          invoice.company.code,
          invoice.department.name,
          invoice.createdBy?.fullName,
          invoice.createdBy?.email,
          invoice.invoiceNo,
          invoice.docType,
          invoice.docId,
          invoice.sourceDocId,
          invoice.sourceDocNo,
          invoice.lotId,
          invoice.referenceDocNo,
          invoice.notes,
          invoice.invoiceType,
          invoice.invoiceTypeLabel,
          invoice.account?.accountName,
          invoice.account?.accountIndex,
          invoice.sourceCompany?.name,
          invoice.sourceCompany?.code,
          invoice.itemName,
          invoice.itemDescription,
          invoice.status,
          invoice.currency,
        ],
        value,
      ),
    );
  }, [invoices, search]);
  const { paginatedItems: paginatedInvoices, ...invoicePagination } =
    usePagination(filteredInvoices);

  if (!canReadInvoices) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view invoices in this company.
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
              Invoice
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Invoice List
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredInvoices.length} invoice records found
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canCreateInvoiceReturn && (
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() => router.push("/user/invoice/new-invoice-return")}
              >
                <FileMinus className="h-4 w-4" />
                New Invoice Return
              </Button>
            )}

            {canCreateInvoice && (
              <Button
                className="h-9 rounded-xl"
                onClick={() => router.push("/user/invoice/new-invoice")}
              >
                <FilePlus className="h-4 w-4" />
                New Invoice
              </Button>
            )}
          </div>
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search invoices"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading invoices...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredInvoices.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No invoices found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2280px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Performed By</th>
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Invoice ID</th>
                    <th className="px-3 py-3 font-medium">Doc ID</th>
                    <th className="px-3 py-3 font-medium">Account</th>
                    <th className="px-3 py-3 font-medium">Account Doc ID</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Source Doc ID</th>
                    <th className="px-3 py-3 font-medium">Item Name</th>
                    <th className="px-3 py-3 font-medium">Description</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">
                      Unit Price
                    </th>
                    <th className="px-3 py-3 text-right font-medium">
                      Total Amount
                    </th>
                    <th className="px-3 py-3 font-medium">Invoice Type</th>
                    <th className="px-3 py-3 font-medium">Reference Doc No</th>
                    <th className="px-3 py-3 font-medium">Remark</th>
                    <th className="px-3 py-3 font-medium">Date Created</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{invoice.company.name}</td>
                      <td className="px-3 py-3">{invoice.department.name}</td>
                      <td className="px-3 py-3">
                        {invoice.createdBy?.fullName ??
                          invoice.createdBy?.email ??
                          "-"}
                      </td>
                      <td className="px-3 py-3">{invoice.docType}</td>
                      <td className="px-3 py-3">
                        <button
                          type="button"
                          className="font-medium text-blue-600 hover:underline"
                          onClick={() =>
                            router.push(`/user/invoice/invoices/${invoice.id}`)
                          }
                        >
                          {invoice.invoiceNo}
                        </button>
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {invoice.docId}
                      </td>
                      <td className="px-3 py-3">{accountName(invoice)}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {accountDocId(invoice)}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {lotId(invoice)}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {sourceDocId(invoice)}
                      </td>
                      <td className="px-3 py-3">{invoice.itemName ?? "-"}</td>
                      <td className="px-3 py-3">
                        {invoice.itemDescription ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {invoice.quantity ?? invoice.docQty}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(invoice.unitPrice ?? 0)}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold text-emerald-600">
                        {formatNumber(invoice.totalAmount)}
                      </td>
                      <td className="px-3 py-3">
                        <InvoiceTypePill type={invoice.invoiceType} />
                      </td>
                      <td className="px-3 py-3">{invoice.referenceDocNo}</td>
                      <td className="px-3 py-3">{invoice.notes ?? "-"}</td>
                      <td className="px-3 py-3">
                        {formatDate(invoice.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={invoice.status} />
                      </td>
                      <td className="px-3 py-3">
                        <Button
                          type="button"
                          variant="outline"
                          className="h-8 rounded-xl"
                          onClick={() =>
                            router.push(`/user/invoice/invoices/${invoice.id}`)
                          }
                        >
                          <Eye className="h-3.5 w-3.5" />
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={invoicePagination.page}
              totalPages={invoicePagination.totalPages}
              start={invoicePagination.start}
              end={invoicePagination.end}
              total={invoicePagination.total}
              onPageChange={invoicePagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
