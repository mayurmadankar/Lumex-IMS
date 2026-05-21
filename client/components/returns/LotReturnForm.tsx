"use client";

import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getInventoryItemByLot,
  returnInventoryItems,
} from "@/api/services/inventory.service";
import type { InventoryItemListItem } from "@/api/services/inventory.service";
import {
  getInvoiceReturnItemByLot,
  returnInvoiceItem,
} from "@/api/services/invoice.service";
import type { InvoiceListItem, InvoiceReturnItem } from "@/api/services/invoice.service";
import {
  getMemoInventoryItemByLot,
  returnMemoInventoryItems,
} from "@/api/services/memo.service";
import type { MemoInventoryItem } from "@/api/services/memo.service";
import {
  createTransferReturn,
  getTransferReturnItemByLot,
} from "@/api/services/transfer.service";
import type { TransferListItem, TransferReturnItem } from "@/api/services/transfer.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import { useCompanyAccess } from "@/hooks/use-company-access";
import { useFormDraft } from "@/hooks/use-form-draft";

type ReturnFlow = "purchase" | "memo" | "invoice" | "transfer";
type ReturnCandidate =
  | InventoryItemListItem
  | MemoInventoryItem
  | InvoiceReturnItem
  | TransferReturnItem;
type ReturnItem = InventoryItemListItem | MemoInventoryItem;

const flowConfig: Record<
  ReturnFlow,
  {
    title: string;
    eyebrow: string;
    module: Parameters<ReturnType<typeof useCompanyAccess>["hasCompanyPermission"]>[0];
    denied: string;
    successLabel: string;
    draftHref: string;
    redirectTo: string;
  }
> = {
  purchase: {
    title: "New Purchase Note Return",
    eyebrow: "Purchase",
    module: "NEW_PURCH_NOTE_RTN",
    denied: "You do not have permission to create purchase returns in this company.",
    successLabel: "Purchase return created",
    draftHref: "/user/purchase/new-purchase-return",
    redirectTo: "/user/purchase/purchase-returns",
  },
  memo: {
    title: "New Memo In Return",
    eyebrow: "Memo In",
    module: "MEMO_IN_RETURN",
    denied: "You do not have permission to create memo returns in this company.",
    successLabel: "Memo return created",
    draftHref: "/user/memo-in/new-memo-return",
    redirectTo: "/user/memo-in/memo-returns",
  },
  invoice: {
    title: "New Invoice Return",
    eyebrow: "Invoice",
    module: "NEW_INVOICE_RETURN",
    denied: "You do not have permission to create invoice returns in this company.",
    successLabel: "Invoice return created",
    draftHref: "/user/invoice/new-invoice-return",
    redirectTo: "/user/invoice/invoices",
  },
  transfer: {
    title: "New Transfer Return",
    eyebrow: "Transfer",
    module: "NEW_TRANSFER_RETURN",
    denied: "You do not have permission to create transfer returns in this company.",
    successLabel: "Transfer return created",
    draftHref: "/user/transfer/new-transfer-return",
    redirectTo: "/user/transfer/transfers",
  },
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value?: number | null, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function itemLabel(item?: ReturnItem | null) {
  if (!item) return "-";
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? item.itemId;
}

function companyLabel(item?: ReturnItem | null) {
  if (!item?.company) return "-";
  return item.company.code
    ? `${item.company.name} (${item.company.code})`
    : item.company.name;
}

function sourceDocumentLabel(flow: ReturnFlow, candidate: ReturnCandidate | null) {
  if (!candidate) return "-";

  if (flow === "invoice") {
    const invoice = (candidate as InvoiceReturnItem).invoice;
    return invoice ? `${invoice.invoiceNo} (${invoice.docType})` : "-";
  }

  if (flow === "transfer") {
    const transfer = (candidate as TransferReturnItem).transfer;
    return transfer ? `${transfer.transferNo} (${transfer.docType})` : "-";
  }

  const item = candidate as ReturnItem;
  const document =
    flow === "purchase"
      ? item.purchase ?? item.purchaseNote
      : item.memo ?? item.originMemo;

  if (!document) return "-";
  if ("purchaseNo" in document) return `${document.purchaseNo} (${document.docType})`;
  return `${document.memoNo} (${document.docType})`;
}

function candidateItem(flow: ReturnFlow, candidate: ReturnCandidate | null) {
  if (!candidate) return null;
  if (flow === "invoice") return (candidate as InvoiceReturnItem).inventoryItem;
  if (flow === "transfer") return (candidate as TransferReturnItem).inventoryItem;
  return candidate as ReturnItem;
}

function returnDestination(flow: ReturnFlow, candidate: ReturnCandidate | null) {
  if (flow !== "transfer" || !candidate) return null;
  const transferCandidate = candidate as TransferReturnItem;
  const department = transferCandidate.returnToDepartment?.name ?? "-";
  const user = transferCandidate.returnToUser?.fullName;
  return user ? `${department} / ${user}` : department;
}

function invoiceAccount(candidate: ReturnCandidate | null) {
  const invoice = (candidate as InvoiceReturnItem | null)?.invoice;
  return invoice?.account?.accountName ?? invoice?.sourceCompany?.name ?? "-";
}

type LotReturnDraft = {
  lotId: string;
  docDate: string;
  referenceDocNo: string;
  notes: string;
};

function defaultLotReturnDraft(): LotReturnDraft {
  return {
    lotId: "",
    docDate: todayInputValue(),
    referenceDocNo: "",
    notes: "",
  };
}

export default function LotReturnForm({ flow }: { flow: ReturnFlow }) {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const config = flowConfig[flow];
  const canReturn = hasCompanyPermission(config.module, "READ_WRITE");
  const [lotId, setLotId] = useState("");
  const [candidate, setCandidate] = useState<ReturnCandidate | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [docDate, setDocDate] = useState(todayInputValue());
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [notes, setNotes] = useState("");
  const [isReturning, setIsReturning] = useState(false);

  const item = useMemo(() => candidateItem(flow, candidate), [candidate, flow]);
  const destination = returnDestination(flow, candidate);
  const draftKey = currentCompany?.id
    ? `ims:draft:${flow}-return:${currentCompany.id}`
    : null;
  const draftValues = useMemo<LotReturnDraft>(
    () => ({
      lotId,
      docDate,
      referenceDocNo,
      notes,
    }),
    [docDate, lotId, notes, referenceDocNo],
  );
  const draftMetadata = useMemo(
    () => ({
      title: config.title,
      subtitle: lotId ? `Lot ${lotId}` : currentCompany?.name ?? config.eyebrow,
      href: config.draftHref,
    }),
    [config.draftHref, config.eyebrow, config.title, currentCompany?.name, lotId],
  );
  useFormDraft<LotReturnDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultLotReturnDraft,
    restore: (draft) => {
      setLotId(draft.lotId ?? "");
      setDocDate(draft.docDate ?? todayInputValue());
      setReferenceDocNo(draft.referenceDocNo ?? "");
      setNotes(draft.notes ?? "");
      setCandidate(null);
      setLookupError(null);
    },
  });

  useEffect(() => {
    const value = lotId.trim();
    setCandidate(null);
    setLookupError(null);

    if (!value) return;

    const parsedLotId = Number(value);
    if (!currentCompany?.id || !Number.isInteger(parsedLotId) || parsedLotId <= 0) {
      setLookupError("Enter a valid Lot ID.");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLookupLoading(true);
        let response;

        if (flow === "purchase") {
          response = await getInventoryItemByLot("user", parsedLotId, {
            companyId: currentCompany.id,
          });
          setCandidate(response.data.inventoryItem);
        } else if (flow === "memo") {
          response = await getMemoInventoryItemByLot("user", parsedLotId, {
            companyId: currentCompany.id,
          });
          setCandidate(response.data.inventoryItem);
        } else if (flow === "invoice") {
          response = await getInvoiceReturnItemByLot("user", parsedLotId, {
            companyId: currentCompany.id,
          });
          setCandidate(response.data.invoiceReturnItem);
        } else {
          response = await getTransferReturnItemByLot("user", parsedLotId, {
            companyId: currentCompany.id,
          });
          setCandidate(response.data.transferReturnItem);
        }
      } catch (error: unknown) {
        const apiError = error as {
          response?: { data?: { message?: string } };
        };
        setLookupError(
          apiError.response?.data?.message ?? "Failed to load Lot ID details.",
        );
      } finally {
        setLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentCompany?.id, flow, lotId]);

  const handleReturn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentCompany?.id || !item) {
      toast.error("Enter a valid Lot ID before returning.");
      return;
    }

    if (!item.department?.id) {
      toast.error("Selected item has no department.");
      return;
    }

    try {
      setIsReturning(true);
      let response;

      if (flow === "purchase") {
        response = await returnInventoryItems("user", {
          departmentId: item.department.id,
          itemIds: [item.id],
          docDate,
          referenceDocNo: referenceDocNo.trim() || undefined,
        });
        toast.success(`${config.successLabel}: ${response.data.purchaseNote.purchaseNo}`);
      } else if (flow === "memo") {
        response = await returnMemoInventoryItems("user", {
          departmentId: item.department.id,
          itemIds: [item.id],
          docDate,
          referenceDocNo: referenceDocNo.trim() || undefined,
        });
        toast.success(`${config.successLabel}: ${response.data.memo.memoNo}`);
      } else if (flow === "invoice") {
        response = await returnInvoiceItem("user", {
          companyId: currentCompany.id,
          inventoryItemId: item.id,
          docDate,
          referenceDocNo: referenceDocNo.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        toast.success(`${config.successLabel}: ${response.data.invoice.invoiceNo}`);
      } else {
        response = await createTransferReturn("user", {
          companyId: currentCompany.id,
          inventoryItemId: item.id,
          docDate,
          referenceDocNo: referenceDocNo.trim() || undefined,
          notes: notes.trim() || undefined,
        });
        toast.success(`${config.successLabel}: ${response.data.transfer.transferNo}`);
      }

      router.push(config.redirectTo);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to return item.");
    } finally {
      setIsReturning(false);
    }
  };

  if (!canReturn) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          {config.denied}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleReturn} className="mx-auto max-w-[1200px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {config.eyebrow}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{config.title}</h1>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => router.back()}
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Lot ID" required error={lookupError ?? undefined}>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={lotId}
                  onChange={(event) => setLotId(event.target.value)}
                  className="h-10 rounded-xl pr-9"
                />
                {lookupLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>
            <Field label="Doc Date">
              <Input
                type="date"
                value={docDate}
                onChange={(event) => setDocDate(event.target.value)}
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Reference Doc No">
              <Input
                value={referenceDocNo}
                onChange={(event) => setReferenceDocNo(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="Optional"
              />
            </Field>
            {(flow === "invoice" || flow === "transfer") && (
              <Field label="Notes">
                <Input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="h-10 rounded-xl"
                  placeholder="Optional"
                />
              </Field>
            )}
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Item Details</h2>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Company">
              <Input value={companyLabel(item)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Department">
              <Input value={item?.department?.name ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Item">
              <Input value={itemLabel(item)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Lot Name">
              <Input value={item?.lotName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Quantity">
              <Input value={item ? String(item.quantity) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Weight">
              <Input value={item ? formatNumber(item.weight, 4) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Total Cost">
              <Input value={item ? formatNumber(item.totalCost) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Certificate No">
              <Input value={item?.certificateNo ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Current Status">
              <Input value={item?.status ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Current Location">
              <Input value={item?.locationAccountName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Vendor / Account">
              <Input
                value={
                  flow === "invoice"
                    ? invoiceAccount(candidate)
                    : item?.vendorAccount?.accountName ?? ""
                }
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Source Document">
              <Input
                value={sourceDocumentLabel(flow, candidate)}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            {destination && (
              <Field label="Return To">
                <Input value={destination} readOnly className="h-10 rounded-xl bg-muted" />
              </Field>
            )}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => router.back()}
            disabled={isReturning}
          >
            Close
          </Button>
          <Button
            type="submit"
            className="h-9 rounded-xl"
            disabled={isReturning || lookupLoading || !item}
          >
            {isReturning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Return Item
          </Button>
        </div>
      </form>
    </div>
  );
}
