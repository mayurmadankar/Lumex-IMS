"use client";

import { ArrowLeft, Loader2, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getMemoOutAccounts,
  getMemoOutReturnItemByLot,
  returnMemoOutItem,
} from "@/api/services/memo-out.service";
import type { MemoOutAccount, MemoOutReturnItem } from "@/api/services/memo-out.service";
import { AccountSearchPicker } from "@/components/common/account-search-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import { useCompanyAccess } from "@/hooks/use-company-access";
import { useFormDraft } from "@/hooks/use-form-draft";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value?: number | null, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function itemLabel(candidate?: MemoOutReturnItem | null) {
  const item = candidate?.inventoryItem;
  if (!item) return "";
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? item.itemId;
}

type MemoOutReturnDraft = {
  accountId: string;
  docDate: string;
  referenceDocNo: string;
  lotId: string;
};

function defaultMemoOutReturnDraft(): MemoOutReturnDraft {
  return {
    accountId: "",
    docDate: todayInputValue(),
    referenceDocNo: "",
    lotId: "",
  };
}

export default function NewMemoOutReturnPage() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const canReturnMemoOut = hasCompanyPermission("NEW_MEMO_OUT_RETURN", "READ_WRITE");

  const [accounts, setAccounts] = useState<MemoOutAccount[]>([]);
  const [accountsLoading, setAccountsLoading] = useState(true);
  const [accountsError, setAccountsError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [docDate, setDocDate] = useState(todayInputValue());
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [lotId, setLotId] = useState("");
  const [candidate, setCandidate] = useState<MemoOutReturnItem | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [isReturning, setIsReturning] = useState(false);

  const selectedAccount = useMemo(
    () => accounts.find((account) => account.id === accountId) ?? null,
    [accountId, accounts],
  );
  const draftKey = currentCompany?.id
    ? `ims:draft:memo-out-return:${currentCompany.id}`
    : null;
  const draftValues = useMemo<MemoOutReturnDraft>(
    () => ({
      accountId,
      docDate,
      referenceDocNo,
      lotId,
    }),
    [accountId, docDate, lotId, referenceDocNo],
  );
  const draftMetadata = useMemo(
    () => ({
      title: "New Memo Out Return",
      subtitle:
        selectedAccount?.accountName ??
        (lotId ? `Lot ${lotId}` : currentCompany?.name ?? "Memo Out return"),
      href: "/user/memo-out/new-memo-out-return",
    }),
    [currentCompany?.name, lotId, selectedAccount?.accountName],
  );
  useFormDraft<MemoOutReturnDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultMemoOutReturnDraft,
    restore: (draft) => {
      setAccountId(draft.accountId ?? "");
      setDocDate(draft.docDate ?? todayInputValue());
      setReferenceDocNo(draft.referenceDocNo ?? "");
      setLotId(draft.lotId ?? "");
      setCandidate(null);
      setLookupError(null);
    },
  });
  const item = candidate?.inventoryItem ?? null;
  const sourceMemoOut = candidate?.memoOut ?? null;

  useEffect(() => {
    const loadAccounts = async () => {
      if (!canReturnMemoOut || !currentCompany?.id) {
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
  }, [canReturnMemoOut, currentCompany?.id]);

  const handleAccountChange = (value: string) => {
    setAccountId(value);
    setLotId("");
    setCandidate(null);
    setLookupError(null);
  };

  useEffect(() => {
    const value = lotId.trim();
    setCandidate(null);
    setLookupError(null);

    if (!value) return;
    if (!selectedAccount) {
      setLookupError("Select the vendor or customer first.");
      return;
    }

    const parsedLotId = Number(value);
    if (!currentCompany?.id || !Number.isInteger(parsedLotId) || parsedLotId <= 0) {
      setLookupError("Enter a valid Lot ID.");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLookupLoading(true);
        const response = await getMemoOutReturnItemByLot("user", parsedLotId, {
          companyId: currentCompany.id,
          accountId: selectedAccount.id,
        });
        setCandidate(response.data.memoOutReturnItem);
      } catch (error: unknown) {
        const apiError = error as {
          response?: { data?: { message?: string } };
        };
        setLookupError(
          apiError.response?.data?.message ?? "Failed to load Memo Out item.",
        );
      } finally {
        setLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentCompany?.id, lotId, selectedAccount]);

  const handleReturn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentCompany?.id) {
      toast.error("Select a company before returning Memo Out.");
      return;
    }

    if (!selectedAccount) {
      toast.error("Select a vendor or customer.");
      return;
    }

    if (!item) {
      toast.error("Enter a valid Memo Out Lot ID.");
      return;
    }

    try {
      setIsReturning(true);
      const response = await returnMemoOutItem("user", {
        companyId: currentCompany.id,
        accountId: selectedAccount.id,
        inventoryItemId: item.id,
        docDate,
        referenceDocNo: referenceDocNo.trim() || undefined,
      });

      toast.success(`Memo Out return created: ${response.data.memoOut.memoNo}`);
      router.push("/user/memo-out/memos");
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to return Memo Out item.");
    } finally {
      setIsReturning(false);
    }
  };

  if (!canReturnMemoOut) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create Memo Out returns in this company.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleReturn} className="mx-auto max-w-[1300px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memo Out
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">New Memo Out Return</h1>
          </div>

          <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
        </div>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Return From Vendor / Customer" required error={accountsError ?? undefined}>
              <AccountSearchPicker
                value={accountId}
                onChange={handleAccountChange}
                options={accounts}
                loading={accountsLoading}
                disabled={accountsLoading || accounts.length === 0}
                placeholder={accountsLoading ? "Loading accounts..." : "Select account"}
                modalTitle="Search Vendor / Customer"
                searchPlaceholder="Search account by name, doc ID, phone, email, or tax ID"
              />
            </Field>

            <Field label="Lot ID" required error={lookupError ?? undefined}>
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
                {lookupLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>

            <Field label="Return Date">
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
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Memo Out Item</h2>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Original Memo Out">
              <Input value={sourceMemoOut ? `${sourceMemoOut.memoNo} (${sourceMemoOut.docId})` : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Memoed To">
              <Input value={sourceMemoOut?.account?.accountName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Item">
              <Input value={itemLabel(candidate)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Department">
              <Input value={item?.department?.name ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Current Status">
              <Input value={item?.status ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Lot Name">
              <Input value={item?.lotName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Certificate No">
              <Input value={item?.certificateNo ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
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
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => router.back()} disabled={isReturning}>
            Close
          </Button>
          <Button type="submit" className="h-9 rounded-xl" disabled={isReturning || lookupLoading || !item}>
            {isReturning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Return Memo Out
          </Button>
        </div>
      </form>
    </div>
  );
}
