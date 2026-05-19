"use client";

import { ArrowLeft, FilePlus2, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { InventoryItemListItem } from "@/api/services/inventory.service";
import {
  createMemoOut,
  getMemoOutAccounts,
  getMemoOutInventoryItemByLot,
} from "@/api/services/memo-out.service";
import type { MemoOutAccount } from "@/api/services/memo-out.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCompanyAccess } from "@/hooks/use-company-access";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value?: number | null, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function accountLabel(account: MemoOutAccount) {
  const type = account.accountType?.name ?? "Account";
  return `${account.accountName} (${type}${account.accountIndex ? ` / ${account.accountIndex}` : ""})`;
}

function itemLabel(item?: InventoryItemListItem | null) {
  if (!item) return "";
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? item.itemId;
}

function sourceDocument(item?: InventoryItemListItem | null) {
  const document = item?.purchase ?? item?.purchaseNote ?? item?.memo ?? item?.originMemo;
  if (!document) return "";
  if ("purchaseNo" in document) return `${document.purchaseNo} (${document.docType})`;
  return `${document.memoNo} (${document.docType})`;
}

function stockCurrency(item?: InventoryItemListItem | null) {
  return item?.purchase?.currency ?? item?.purchaseNote?.currency ?? item?.memo?.currency ?? "USD";
}

export default function NewMemoOutPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const canCreateMemoOut = hasCompanyPermission("NEW_MEMO_OUT", "READ_WRITE");

  const [accounts, setAccounts] = useState<MemoOutAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [docDate, setDocDate] = useState(todayInputValue());
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [lotId, setLotId] = useState("");
  const [lotItem, setLotItem] = useState<InventoryItemListItem | null>(null);
  const [lotLookupLoading, setLotLookupLoading] = useState(false);
  const [lotLookupError, setLotLookupError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accountId, accounts],
  );

  useEffect(() => {
    const loadAccounts = async () => {
      if (!canCreateMemoOut || !currentCompany?.id) {
        setAccounts([]);
        setAccountsLoading(false);
        return;
      }

      try {
        setAccountsLoading(true);
        setAccountsError(null);
        const response = await getMemoOutAccounts("user", {
          companyId: currentCompany.id,
        });
        setAccounts(response.data.accounts ?? []);
      } catch {
        setAccounts([]);
        setAccountsError("Failed to load vendors and customers.");
      } finally {
        setAccountsLoading(false);
      }
    };

    loadAccounts();
  }, [canCreateMemoOut, currentCompany?.id]);

  useEffect(() => {
    setLotId("");
    setLotItem(null);
    setLotLookupError(null);
  }, [accountId, currentCompany?.id]);

  useEffect(() => {
    const value = lotId.trim();
    setLotItem(null);
    setLotLookupError(null);

    if (!value) return;
    if (!selectedAccount) {
      setLotLookupError("Select a vendor or customer first.");
      return;
    }

    const parsedLotId = Number(value);
    if (!currentCompany?.id || !Number.isInteger(parsedLotId) || parsedLotId <= 0) {
      setLotLookupError("Enter a valid Lot ID.");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLotLookupLoading(true);
        const response = await getMemoOutInventoryItemByLot("user", parsedLotId, {
          companyId: currentCompany.id,
        });
        setLotItem(response.data.inventoryItem);
      } catch (error: unknown) {
        const apiError = error as {
          response?: { data?: { message?: string } };
        };
        setLotLookupError(
          apiError.response?.data?.message ?? "Failed to load Lot ID item.",
        );
      } finally {
        setLotLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentCompany?.id, lotId, selectedAccount]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentCompany?.id) {
      toast.error("Select a company before creating Memo Out.");
      return;
    }

    if (!selectedAccount) {
      toast.error("Select a vendor or customer.");
      return;
    }

    if (!lotItem) {
      toast.error("Enter a valid stock Lot ID.");
      return;
    }

    try {
      setIsSaving(true);
      const response = await createMemoOut("user", {
        companyId: currentCompany.id,
        accountId: selectedAccount.id,
        inventoryItemId: lotItem.id,
        docDate,
        referenceDocNo: referenceDocNo.trim() || undefined,
        paymentTerm: paymentTerm ? Number(paymentTerm) : null,
        currency: stockCurrency(lotItem),
      });

      toast.success(`Memo Out created: ${response.data.memoOut.memoNo}`);
      router.push("/user/memo-out/memos");
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to create Memo Out.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canCreateMemoOut) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create Memo Out documents in this company.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1300px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memo Out
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">New Memo Out</h1>
          </div>

          <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-50 text-orange-700">
              <FilePlus2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Memo Header</h2>
              <p className="text-xs text-muted-foreground">
                {currentCompany?.name ?? "No company selected"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Vendor / Customer" required error={accountsError ?? undefined}>
              <Select
                value={accountId || undefined}
                onValueChange={setAccountId}
                disabled={accountsLoading || accounts.length === 0}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue
                    placeholder={accountsLoading ? "Loading accounts..." : "Select account"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((account) => (
                    <SelectItem key={account.id} value={account.id}>
                      {accountLabel(account)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Memo Date">
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

            <Field label="Payment Term">
              <Input
                type="number"
                min="1"
                max="15"
                value={paymentTerm}
                onChange={(event) => setPaymentTerm(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="Days"
              />
            </Field>
          </div>

          {selectedAccount && (
            <div className="border-t bg-muted/20 p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <Field label="Account Name">
                  <Input value={selectedAccount.accountName} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Account Type">
                  <Input value={selectedAccount.accountType?.name ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Account Doc ID">
                  <Input value={selectedAccount.accountIndex ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Phone">
                  <Input value={selectedAccount.phone1 ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Email">
                  <Input value={selectedAccount.email ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Tax ID">
                  <Input value={selectedAccount.trnNo ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Inventory Item</h2>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Lot ID" required error={lotLookupError ?? undefined}>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={lotId}
                  onChange={(event) => setLotId(event.target.value)}
                  className="h-10 rounded-xl pr-9"
                  disabled={!selectedAccount}
                />
                {lotLookupLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>
            <Field label="Item">
              <Input value={itemLabel(lotItem)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Department">
              <Input value={lotItem?.department?.name ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Location">
              <Input value={lotItem?.locationAccountName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Certificate No">
              <Input value={lotItem?.certificateNo ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Quantity">
              <Input value={lotItem ? String(lotItem.quantity) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Weight">
              <Input value={lotItem ? formatNumber(lotItem.weight, 4) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Total Cost">
              <Input value={lotItem ? formatNumber(lotItem.totalCost) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Currency">
              <Input value={stockCurrency(lotItem)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Source Document">
              <Input value={sourceDocument(lotItem)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => router.back()} disabled={isSaving}>
            Close
          </Button>
          <Button type="submit" className="h-9 rounded-xl" disabled={isSaving || lotLookupLoading || !lotItem}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save Memo Out
          </Button>
        </div>
      </form>
    </div>
  );
}
