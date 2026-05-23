"use client";

import {
  ArrowLeft,
  Building2,
  FilePlus2,
  Loader2,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { getAccounts } from "@/api/services/account.service";
import type { AccountListItem } from "@/api/services/account.service";
import { getItems } from "@/api/services/item.service";
import type { ItemListItem } from "@/api/services/item.service";
import { createMemo } from "@/api/services/memo.service";
import { AccountSearchPicker } from "@/components/common/account-search-picker";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import Pagination from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  CURRENCY_OPTIONS,
  DEFAULT_CURRENCY,
  type CurrencyCode,
} from "@/config/currencies";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useFormDraft } from "@/hooks/use-form-draft";
import { DEFAULT_PAGE_SIZE, usePagination } from "@/hooks/use-pagination";
import { useAppSelector } from "@/store/hooks";
import type { CompanyOption, DepartmentAccessOption } from "@/store/types/types";

type ParcelOrStone = "PARCEL" | "STONE";

type MemoLine = {
  lineId: number;
  itemMasterId: string;
  lotName: string;
  quantity: string;
  weight: string;
  certificateNo: string;
  totalCost: string;
  remark: string;
  parcelOrStone: ParcelOrStone;
  departmentAccountName: string;
};

type MemoLineField = Exclude<keyof MemoLine, "lineId" | "departmentAccountName">;

const NO_PAYMENT_TERM = "__NONE__";

const paymentTermOptions = Array.from({ length: 15 }, (_, index) => {
  const value = String(index + 1);
  return {
    value,
    label: `${value} ${value === "1" ? "Day" : "Days"}`,
  };
});

type MemoDraft = {
  selectedAccountId: string;
  paymentTerm: string;
  currency: CurrencyCode;
  docDate: string;
  status: "ACTIVE" | "CANCELLED";
  memoLines: MemoLine[];
  nextLineId: number;
};

function defaultMemoDraft(): MemoDraft {
  return {
    selectedAccountId: "",
    paymentTerm: "",
    currency: DEFAULT_CURRENCY,
    docDate: todayInputValue(),
    status: "ACTIVE",
    memoLines: [],
    nextLineId: 1,
  };
}

function normalizePaymentTerm(value: unknown) {
  if (value === null || value === undefined || value === "" || value === NO_PAYMENT_TERM) {
    return "";
  }

  const numericValue = Number(value);
  if (!Number.isInteger(numericValue) || numericValue < 1 || numericValue > 15) {
    return "";
  }

  return String(numericValue);
}

function isVendorAccount(account: AccountListItem) {
  return account.accountType.name.trim().toLowerCase() === "vendor";
}

function companyLabel(company: CompanyOption) {
  return company.code ? `${company.name} (${company.code})` : company.name;
}

function departmentOptionLabel(access: DepartmentAccessOption) {
  const company = access.companyCode
    ? `${access.companyName} (${access.companyCode})`
    : access.companyName;
  return `${company} - ${access.departmentName}`;
}

function accessAllows(
  access: DepartmentAccessOption,
  module: "NEW_MEMO_IN" | "ITEM_LIST" | "ACCOUNT_LIST",
  required: "READ_ONLY" | "READ_WRITE",
) {
  return permissionAllows(permissionsToMap(access.permissions)[module], required);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(lineId: number, departmentAccountName = ""): MemoLine {
  return {
    lineId,
    itemMasterId: "",
    lotName: "",
    quantity: "",
    weight: "",
    certificateNo: "",
    totalCost: "",
    remark: "",
    parcelOrStone: "STONE",
    departmentAccountName,
  };
}

function vendorReferenceCode(account: AccountListItem | undefined) {
  return account?.trnNo ?? account?.accountIndex ?? "";
}

function itemLabel(item: ItemListItem) {
  return `${item.itemId} - ${item.itemName}`;
}

function lineTotal(line: Pick<MemoLine, "totalCost">) {
  return Number(line.totalCost) || 0;
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function hasCertificateNo(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

export default function NewMemoForm() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const departmentAccesses = user?.departmentAccesses ?? [];
  const memoDepartmentOptions = useMemo(() => {
    const allowedAccesses = departmentAccesses.filter((access) =>
      accessAllows(access, "NEW_MEMO_IN", "READ_WRITE"),
    );
    const companyAllowedAccesses = allowedAccesses.filter(
      (access) => !selectedCompanyId || access.companyId === selectedCompanyId,
    );

    return companyAllowedAccesses.length > 0
      ? companyAllowedAccesses
      : allowedAccesses;
  }, [departmentAccesses, selectedCompanyId]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const selectedAccess =
    memoDepartmentOptions.find(
      (access) => access.departmentId === selectedDepartmentId,
    ) ?? memoDepartmentOptions[0];
  const selectedPermissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : ({} as ReturnType<typeof permissionsToMap>);
  const canReadAccounts = permissionAllows(
    selectedPermissionMap.ACCOUNT_LIST,
    "READ_ONLY",
  );
  const canReadItems = permissionAllows(
    selectedPermissionMap.ITEM_LIST,
    "READ_ONLY",
  );

  const [vendorAccounts, setVendorAccounts] = useState<AccountListItem[]>([]);
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [docDate, setDocDate] = useState(todayInputValue());
  const [status, setStatus] = useState<"ACTIVE" | "CANCELLED">("ACTIVE");
  const [memoLines, setMemoLines] = useState<MemoLine[]>([]);
  const [nextLineId, setNextLineId] = useState(1);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const preferredDepartmentId = user?.selectedDepartmentId ?? "";
    const preferredDepartment = memoDepartmentOptions.find(
      (access) => access.departmentId === preferredDepartmentId,
    );
    const fallbackDepartmentId =
      preferredDepartment?.departmentId ??
      memoDepartmentOptions[0]?.departmentId ??
      "";

    setSelectedDepartmentId((currentDepartmentId) =>
      memoDepartmentOptions.some(
        (access) => access.departmentId === currentDepartmentId,
      )
        ? currentDepartmentId
        : fallbackDepartmentId,
    );
  }, [memoDepartmentOptions, user?.selectedDepartmentId]);

  const currentCompany = useMemo(() => {
    if (selectedAccess) {
      return {
        id: selectedAccess.companyId,
        name: selectedAccess.companyName,
        code: selectedAccess.companyCode,
        status: selectedAccess.companyStatus,
      };
    }

    return (
      accessibleCompanies.find((company) => company.id === selectedCompanyId) ??
      null
    );
  }, [accessibleCompanies, selectedAccess, selectedCompanyId]);

  const selectedVendor = vendorAccounts.find(
    (account) => account.id === selectedAccountId,
  );

  const totals = useMemo(
    () =>
      memoLines.reduce(
        (sum, line) => ({
          quantity: sum.quantity + (Number(line.quantity) || 0),
          weight: sum.weight + (Number(line.weight) || 0),
          price: sum.price + lineTotal(line),
        }),
        { quantity: 0, weight: 0, price: 0 },
      ),
    [memoLines],
  );
  const { paginatedItems: paginatedMemoLines, ...memoLinePagination } =
    usePagination(memoLines, DEFAULT_PAGE_SIZE, memoLines.length);
  const draftKey =
    selectedDepartmentId && currentCompany?.id
      ? `ims:draft:memo-in:${selectedDepartmentId}:${currentCompany.id}`
      : null;
  const draftValues = useMemo<MemoDraft>(
    () => ({
      selectedAccountId,
      paymentTerm,
      currency,
      docDate,
      status,
      memoLines,
      nextLineId,
    }),
    [
      currency,
      docDate,
      memoLines,
      nextLineId,
      paymentTerm,
      selectedAccountId,
      status,
    ],
  );
  const draftMetadata = useMemo(
    () => ({
      title: "New Memo In",
      subtitle:
        selectedVendor?.accountName ??
        (memoLines.length > 0 ? `${memoLines.length} line${memoLines.length === 1 ? "" : "s"}` : "Memo draft"),
      href: "/user/memo-in/new-memo",
    }),
    [memoLines.length, selectedVendor?.accountName],
  );
  const { saveDraft: saveMemoDraft } = useFormDraft<MemoDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultMemoDraft,
    restore: (draft) => {
      const lines = Array.isArray(draft.memoLines) ? draft.memoLines : [];
      const fallbackLineId =
        lines.reduce((max, line) => Math.max(max, Number(line.lineId) || 0), 0) +
        1;
      const restoredLineId = Number(draft.nextLineId);

      setSelectedAccountId(draft.selectedAccountId ?? "");
      setPaymentTerm(normalizePaymentTerm(draft.paymentTerm));
      setCurrency(draft.currency ?? DEFAULT_CURRENCY);
      setDocDate(draft.docDate ?? todayInputValue());
      setStatus(draft.status ?? "ACTIVE");
      setMemoLines(
        lines.map((line) => ({
          ...line,
          quantity: hasCertificateNo(line.certificateNo) ? "1" : line.quantity,
          parcelOrStone: "STONE",
        })),
      );
      setNextLineId(restoredLineId > 0 ? restoredLineId : fallbackLineId);
    },
  });

  useEffect(() => {
    const loadVendorAccounts = async () => {
      if (!selectedDepartmentId) {
        setVendorAccounts([]);
        setVendorsLoading(false);
        setVendorsError("Select a department before creating a memo.");
        return;
      }

      if (!canReadAccounts) {
        setVendorAccounts([]);
        setVendorsLoading(false);
        setVendorsError("Account List read permission is required to select a vendor.");
        return;
      }

      try {
        setVendorsLoading(true);
        setVendorsError(null);
        const response = await getAccounts("user", {
          departmentId: selectedDepartmentId,
          status: "ACTIVE",
        });
        setVendorAccounts((response.data.accounts ?? []).filter(isVendorAccount));
      } catch {
        setVendorAccounts([]);
        setVendorsError("Failed to load vendor accounts.");
      } finally {
        setVendorsLoading(false);
      }
    };

    loadVendorAccounts();
  }, [canReadAccounts, selectedDepartmentId]);

  useEffect(() => {
    const loadItems = async () => {
      if (!selectedDepartmentId) {
        setItems([]);
        setItemsLoading(false);
        setItemsError("Select a department before creating a memo.");
        return;
      }

      if (!canReadItems) {
        setItems([]);
        setItemsLoading(false);
        setItemsError("Item List read permission is required to select items.");
        return;
      }

      try {
        setItemsLoading(true);
        setItemsError(null);
        const response = await getItems("user", {
          departmentId: selectedDepartmentId,
        });
        setItems(response.data.items ?? []);
      } catch {
        setItems([]);
        setItemsError("Failed to load items.");
      } finally {
        setItemsLoading(false);
      }
    };

    loadItems();
  }, [canReadItems, selectedDepartmentId]);

  const handlePaymentTermChange = (value: string) => {
    const nextPaymentTerm = normalizePaymentTerm(value);
    setPaymentTerm(nextPaymentTerm);
    saveMemoDraft({ ...draftValues, paymentTerm: nextPaymentTerm });
  };

  const handleDepartmentChange = (departmentId: string) => {
    if (departmentId === selectedDepartmentId) return;

    setSelectedDepartmentId(departmentId);
    setSelectedAccountId("");
    setMemoLines([]);
    setNextLineId(1);
    memoLinePagination.setPage(1);
  };

  const handleAddLine = () => {
    if (!selectedDepartmentId) {
      toast.error("Select a department before adding a line.");
      return;
    }

    if (!canReadItems) {
      toast.error("Item List read permission is required to select items.");
      return;
    }

    if (itemsLoading) {
      toast.error("Items are still loading.");
      return;
    }

    if (items.length === 0) {
      toast.error("No items available for this department company.");
      return;
    }

    const lineId = nextLineId;
    setMemoLines((lines) => [
      ...lines,
      emptyLine(lineId, selectedAccess?.departmentName ?? ""),
    ]);
    setNextLineId(lineId + 1);
  };

  const updateLine = (lineId: number, field: MemoLineField, value: string) => {
    setMemoLines((lines) =>
      lines.map((line) => {
        if (line.lineId !== lineId) return line;

        if (field === "quantity" && hasCertificateNo(line.certificateNo)) {
          return { ...line, quantity: "1" };
        }

        if (field === "certificateNo") {
          return {
            ...line,
            certificateNo: value,
            quantity: hasCertificateNo(value) ? "1" : line.quantity,
            parcelOrStone: "STONE",
          };
        }

        if (field === "parcelOrStone") {
          return { ...line, parcelOrStone: "STONE" };
        }

        return { ...line, [field]: value };
      }),
    );
  };

  const removeLine = (lineId: number) => {
    setMemoLines((lines) => lines.filter((line) => line.lineId !== lineId));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedDepartmentId) {
      toast.error("Select a department before saving a memo.");
      return;
    }

    if (!canReadAccounts) {
      toast.error("Account List read permission is required to select a vendor.");
      return;
    }

    if (!canReadItems) {
      toast.error("Item List read permission is required to select items.");
      return;
    }

    if (!selectedVendor) {
      toast.error("Select a vendor account.");
      return;
    }

    if (memoLines.length === 0) {
      toast.error("Insert at least one memo item.");
      return;
    }

    const incompleteLine = memoLines.find(
      (line) =>
        !line.lotName.trim() ||
        !line.itemMasterId ||
        Number(line.quantity) <= 0 ||
        Number(line.weight) <= 0 ||
        Number(line.certificateNo) <= 0 ||
        Number(line.totalCost) <= 0 ||
        !line.parcelOrStone,
    );

    if (incompleteLine) {
      toast.error(`Complete item details for Line ${incompleteLine.lineId}.`);
      return;
    }

    const invalidCertifiedQuantityLine = memoLines.find(
      (line) => hasCertificateNo(line.certificateNo) && Number(line.quantity) !== 1,
    );

    if (invalidCertifiedQuantityLine) {
      toast.error(
        `Certificate item on Line ${invalidCertifiedQuantityLine.lineId} must have Qty 1.`,
      );
      return;
    }

    const payload = {
      departmentId: selectedDepartmentId,
      accountId: selectedVendor.id,
      paymentTerm: paymentTerm ? Number(paymentTerm) : null,
      currency,
      docDate,
      status,
      items: memoLines.map((line) => ({
        lotName: line.lotName,
        itemMasterId: line.itemMasterId,
        quantity: line.quantity,
        weight: line.weight,
        totalCost: line.totalCost,
        labAccountName: selectedAccess?.departmentName ?? "System",
        certificateNo: line.certificateNo,
        parcelOrStone: line.parcelOrStone,
        remark: line.remark,
      })),
    };

    try {
      setIsSaving(true);
      const response = await createMemo("user", payload);
      toast.success(`Memo created: ${response.data.memo.memoNo}`);
      router.push("/user/memo-in/memos");
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to save memo.");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Memo In
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              New Memo
            </h1>
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
          <div className="flex items-center gap-3 border-b px-5 py-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <FilePlus2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Header</h2>
              <p className="text-xs text-muted-foreground">
                {currentCompany ? companyLabel(currentCompany) : "No company selected"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Vendor" required error={vendorsError ?? undefined}>
              <AccountSearchPicker
                value={selectedAccountId}
                onChange={setSelectedAccountId}
                options={vendorAccounts}
                loading={vendorsLoading}
                disabled={vendorsLoading || vendorAccounts.length === 0}
                placeholder={vendorsLoading ? "Loading vendors..." : "Select vendor"}
                modalTitle="Search Vendor"
                searchPlaceholder="Search vendor by name, doc ID, phone, email, or tax ID"
                emptyMessage="No vendor accounts found."
              />
            </Field>

            <Field label="Vendor DocID">
              <Input
                value={selectedVendor?.accountIndex ?? ""}
                readOnly
                className="h-10 rounded-xl bg-muted"
                placeholder="Auto-filled from vendor"
              />
            </Field>

            <Field label="Payment Term">
              <Select
                value={paymentTerm || NO_PAYMENT_TERM}
                onValueChange={handlePaymentTermChange}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Payment term" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PAYMENT_TERM}>Empty</SelectItem>
                  {paymentTermOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Department" required>
              {memoDepartmentOptions.length > 1 ? (
                <Select
                  value={selectedDepartmentId || undefined}
                  onValueChange={handleDepartmentChange}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {memoDepartmentOptions.map((access) => (
                      <SelectItem key={access.id} value={access.departmentId}>
                        {departmentOptionLabel(access)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={
                    selectedAccess
                      ? departmentOptionLabel(selectedAccess)
                      : "No permitted department"
                  }
                  readOnly
                  className="h-10 rounded-xl bg-muted"
                />
              )}
            </Field>

            <Field label="Doc Date">
              <Input
                type="date"
                value={docDate}
                onChange={(event) => setDocDate(event.target.value)}
                className="h-10 rounded-xl"
              />
            </Field>

            <Field label="Doc Status">
              <Select
                value={status}
                onValueChange={(value) => setStatus(value as "ACTIVE" | "CANCELLED")}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="CANCELLED">Cancelled</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Currency">
              <Select
                value={currency}
                onValueChange={(value) => setCurrency(value as CurrencyCode)}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Currency" />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCY_OPTIONS.map((option) => (
                    <SelectItem key={option} value={option}>
                      {option}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {selectedVendor && (
            <div className="border-t bg-muted/20 p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <Field label="Address">
                  <Input
                    value={selectedVendor.address ?? ""}
                    readOnly
                    className="h-10 rounded-xl bg-background"
                  />
                </Field>
                <Field label="Country">
                  <Input
                    value={selectedVendor.countryIso2 ?? ""}
                    readOnly
                    className="h-10 rounded-xl bg-background"
                  />
                </Field>
                <Field label="State">
                  <Input
                    value={selectedVendor.state?.name ?? selectedVendor.state?.code ?? ""}
                    readOnly
                    className="h-10 rounded-xl bg-background"
                  />
                </Field>
                <Field label="CityId">
                  <Input
                    value={selectedVendor.city ?? ""}
                    readOnly
                    className="h-10 rounded-xl bg-background"
                  />
                </Field>
                <Field label="Phone Number">
                  <Input
                    value={selectedVendor.phone1 ?? ""}
                    readOnly
                    className="h-10 rounded-xl bg-background"
                  />
                </Field>
                <Field label="Reference Code">
                  <Input
                    value={vendorReferenceCode(selectedVendor)}
                    readOnly
                    className="h-10 rounded-xl bg-background"
                  />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Building2 className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-semibold">Lines</h2>
                <p className="text-xs text-muted-foreground">
                  {memoLines.length} records found
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              className="h-9 rounded-xl"
              onClick={handleAddLine}
              disabled={!selectedDepartmentId || !canReadItems || itemsLoading || items.length === 0}
            >
              <Plus className="h-4 w-4" />
              Add Line
            </Button>
          </div>

          {(vendorsError || itemsError || (!itemsLoading && items.length === 0)) && (
            <div className="border-b bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
              {vendorsError ? <p>{vendorsError}</p> : null}
              {itemsError ? <p>{itemsError}</p> : null}
              {!itemsLoading && items.length === 0 && !itemsError ? (
                <p>No item master records found for this department company.</p>
              ) : null}
            </div>
          )}

          {memoLines.length === 0 ? (
            <div className="px-5 py-16 text-center text-sm text-muted-foreground">
              No data
            </div>
          ) : (
            <div className="space-y-4 p-5">
              {paginatedMemoLines.map((line) => (
                <div key={line.lineId} className="rounded-2xl border bg-muted/20 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                        Doc Line
                      </p>
                      <p className="text-sm font-semibold">Line {line.lineId}</p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeLine(line.lineId)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                    <Field label="ItemID" required>
                      <Select
                        value={line.itemMasterId}
                        onValueChange={(value) =>
                          updateLine(
                            line.lineId,
                            "itemMasterId",
                            value,
                          )
                        }
                        disabled={itemsLoading || items.length === 0}
                      >
                        <SelectTrigger className="h-10 w-full rounded-xl">
                          <SelectValue
                            placeholder={
                              itemsLoading
                                ? "Loading items..."
                                : itemsError
                                  ? "Items unavailable"
                                  : "Select item"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {items.map((option) => (
                            <SelectItem key={option.id} value={option.id}>
                              {itemLabel(option)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="Parcel/Stone" required>
                      <Select
                        value={line.parcelOrStone}
                        onValueChange={(value) =>
                          updateLine(
                            line.lineId,
                            "parcelOrStone",
                            value as ParcelOrStone,
                          )
                        }
                      >
                        <SelectTrigger className="h-10 w-full rounded-xl">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="STONE">Stone</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>

                    <Field label="LotID">
                      <Input
                        value="Generated on save"
                        readOnly
                        className="h-10 rounded-xl bg-muted"
                      />
                    </Field>

                    <Field label="LOT NAME" required>
                      <Input
                        value={line.lotName}
                        onChange={(event) =>
                          updateLine(line.lineId, "lotName", event.target.value)
                        }
                        className="h-10 rounded-xl"
                      />
                    </Field>

                    <Field label="Weight" required>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.weight}
                        onChange={(event) =>
                          updateLine(line.lineId, "weight", event.target.value)
                        }
                        className="h-10 rounded-xl"
                      />
                    </Field>

                    <Field label="Qty" required>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={line.quantity}
                        onChange={(event) =>
                          updateLine(line.lineId, "quantity", event.target.value)
                        }
                        readOnly={hasCertificateNo(line.certificateNo)}
                        className={`h-10 rounded-xl ${
                          hasCertificateNo(line.certificateNo) ? "bg-muted" : ""
                        }`}
                      />
                    </Field>

                    <Field label="Certificate No" required>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={line.certificateNo}
                        onChange={(event) =>
                          updateLine(line.lineId, "certificateNo", event.target.value)
                        }
                        className="h-10 rounded-xl"
                      />
                    </Field>

                    <Field label="Total Cost" required>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={line.totalCost}
                        onChange={(event) =>
                          updateLine(line.lineId, "totalCost", event.target.value)
                        }
                        className="h-10 rounded-xl"
                      />
                    </Field>

                    <Field label="Department Account Name" required>
                      <Input
                        value={line.departmentAccountName}
                        readOnly
                        className="h-10 rounded-xl bg-muted"
                      />
                    </Field>

                    <Field label="Remark">
                      <Input
                        value={line.remark}
                        onChange={(event) =>
                          updateLine(line.lineId, "remark", event.target.value)
                        }
                        className="h-10 rounded-xl"
                        placeholder="Remark"
                      />
                    </Field>
                  </div>
                </div>
              ))}
              <Pagination
                page={memoLinePagination.page}
                totalPages={memoLinePagination.totalPages}
                start={memoLinePagination.start}
                end={memoLinePagination.end}
                total={memoLinePagination.total}
                onPageChange={memoLinePagination.setPage}
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border bg-background px-5 py-4">
          <div className="grid gap-4 text-sm md:grid-cols-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Qty
              </p>
              <p className="mt-1 font-semibold">{totals.quantity}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Weight
              </p>
              <p className="mt-1 font-semibold">{totals.weight.toFixed(4)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Doc Grand T. Price
              </p>
              <p className="mt-1 font-semibold">{formatAmount(totals.price)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Account
              </p>
              <p className="mt-1 font-semibold">
                {selectedVendor?.accountName ?? "Not selected"}
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => router.back()}
          >
            Close
          </Button>
          <Button
            type="submit"
            className="h-9 rounded-xl"
            disabled={isSaving}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save & Close
          </Button>
        </div>
      </form>
    </div>
  );
}
