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
import { createPurchaseNote } from "@/api/services/purchase.service";
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
import type { DepartmentAccessOption } from "@/store/types/types";

type PurchaseFrom = "LOCAL_PURCHASE" | "IMPORT_PURCHASE";
type ParcelOrStone = "PARCEL" | "STONE";
type PurchaseStatus = "ACTIVE" | "CANCELLED";

type LocalPurchaseItem = {
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

type LocalPurchaseItemField = Exclude<
  keyof LocalPurchaseItem,
  "lineId" | "departmentAccountName"
>;

const NO_PAYMENT_TERM = "__NONE__";

const paymentTermOptions = Array.from({ length: 15 }, (_, index) => {
  const value = String(index + 1);
  return {
    value,
    label: `${value} ${value === "1" ? "Day" : "Days"}`,
  };
});

const purchaseFromOptions: Array<{ value: PurchaseFrom; label: string }> = [
  { value: "LOCAL_PURCHASE", label: "Local Purchase" },
  { value: "IMPORT_PURCHASE", label: "Import Purchase" },
];

const purchaseFromLabels = purchaseFromOptions.reduce<Record<PurchaseFrom, string>>(
  (labels, option) => {
    labels[option.value] = option.label;
    return labels;
  },
  {
    LOCAL_PURCHASE: "Local Purchase",
    IMPORT_PURCHASE: "Import Purchase",
  },
);

type PurchaseNoteDraft = {
  selectedAccountId: string;
  purchaseFrom: PurchaseFrom;
  paymentTerm: string;
  currency: CurrencyCode;
  docDate: string;
  status: PurchaseStatus;
  localPurchaseItems: LocalPurchaseItem[];
  nextLineId: number;
};

function defaultPurchaseNoteDraft(): PurchaseNoteDraft {
  return {
    selectedAccountId: "",
    purchaseFrom: "LOCAL_PURCHASE",
    paymentTerm: "",
    currency: DEFAULT_CURRENCY,
    docDate: todayInputValue(),
    status: "ACTIVE",
    localPurchaseItems: [],
    nextLineId: 1,
  };
}

function normalizePurchaseFrom(value?: PurchaseFrom) {
  return purchaseFromOptions.some((option) => option.value === value)
    ? (value as PurchaseFrom)
    : "LOCAL_PURCHASE";
}

function normalizePurchaseStatus(value?: PurchaseStatus) {
  return value === "CANCELLED" ? value : "ACTIVE";
}

function normalizeCurrency(value?: string): CurrencyCode {
  return CURRENCY_OPTIONS.includes(value as CurrencyCode)
    ? (value as CurrencyCode)
    : DEFAULT_CURRENCY;
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

function departmentOptionLabel(access: DepartmentAccessOption) {
  return access.departmentName;
}

function accessAllows(
  access: DepartmentAccessOption,
  module: "NEW_PURCHASE_NOTE" | "ACCOUNT_LIST",
  required: "READ_ONLY" | "READ_WRITE",
) {
  return permissionAllows(permissionsToMap(access.permissions)[module], required);
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function vendorReferenceCode(account: AccountListItem | undefined) {
  return account?.trnNo ?? account?.accountIndex ?? "";
}

function itemLabel(item: ItemListItem) {
  return `${item.itemId} - ${item.itemName}`;
}

function lineTotal(item: Pick<LocalPurchaseItem, "totalCost">) {
  return Number(item.totalCost) || 0;
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function hasCertificateNo(value: unknown) {
  return String(value ?? "").trim().length > 0;
}

export default function NewPurchaseNoteForm() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const departmentAccesses = user?.departmentAccesses ?? [];
  const purchaseDepartmentOptions = useMemo(() => {
    const allowedAccesses = departmentAccesses.filter((access) =>
      accessAllows(access, "NEW_PURCHASE_NOTE", "READ_WRITE"),
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
    purchaseDepartmentOptions.find(
      (access) => access.departmentId === selectedDepartmentId,
    ) ?? purchaseDepartmentOptions[0];
  const selectedPermissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : ({} as ReturnType<typeof permissionsToMap>);
  const canReadAccounts = permissionAllows(
    selectedPermissionMap.ACCOUNT_LIST,
    "READ_ONLY",
  );

  const [vendorAccounts, setVendorAccounts] = useState<AccountListItem[]>([]);
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [vendorsLoading, setVendorsLoading] = useState(true);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [vendorsError, setVendorsError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [purchaseFrom, setPurchaseFrom] =
    useState<PurchaseFrom>("LOCAL_PURCHASE");
  const [paymentTerm, setPaymentTerm] = useState("");
  const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
  const [docDate, setDocDate] = useState(todayInputValue());
  const [status, setStatus] = useState<PurchaseStatus>("ACTIVE");
  const [localPurchaseItems, setLocalPurchaseItems] = useState<LocalPurchaseItem[]>(
    [],
  );
  const [nextLineId, setNextLineId] = useState(1);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const preferredDepartmentId = user?.selectedDepartmentId ?? "";
    const preferredDepartment = purchaseDepartmentOptions.find(
      (access) => access.departmentId === preferredDepartmentId,
    );
    const fallbackDepartmentId =
      preferredDepartment?.departmentId ??
      purchaseDepartmentOptions[0]?.departmentId ??
      "";

    setSelectedDepartmentId((currentDepartmentId) =>
      purchaseDepartmentOptions.some(
        (access) => access.departmentId === currentDepartmentId,
      )
        ? currentDepartmentId
        : fallbackDepartmentId,
    );
  }, [purchaseDepartmentOptions, user?.selectedDepartmentId]);

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

  const isLocalPurchase = purchaseFrom === "LOCAL_PURCHASE";
  const selectedVendor = vendorAccounts.find(
    (account) => account.id === selectedAccountId,
  );
  const sourceSelected = Boolean(selectedVendor);
  const sourceFieldLabel = "Vendor";
  const sourcePlaceholder = vendorsLoading ? "Loading vendors..." : "Select vendor";

  const totals = useMemo(
    () =>
      localPurchaseItems.reduce(
        (sum, item) => ({
          quantity: sum.quantity + (Number(item.quantity) || 0),
          weight: sum.weight + (Number(item.weight) || 0),
          price: sum.price + lineTotal(item),
        }),
        { quantity: 0, weight: 0, price: 0 },
      ),
    [localPurchaseItems],
  );
  const {
    paginatedItems: paginatedLocalPurchaseItems,
    ...localPurchaseItemPagination
  } = usePagination(
    localPurchaseItems,
    DEFAULT_PAGE_SIZE,
    selectedDepartmentId,
  );
  const draftKey =
    selectedDepartmentId && currentCompany?.id
      ? `ims:draft:purchase-note:${selectedDepartmentId}:${currentCompany.id}`
      : null;
  const draftValues = useMemo<PurchaseNoteDraft>(
    () => ({
      selectedAccountId,
      purchaseFrom,
      paymentTerm,
      currency,
      docDate,
      status,
      localPurchaseItems,
      nextLineId,
    }),
    [
      currency,
      docDate,
      localPurchaseItems,
      nextLineId,
      paymentTerm,
      purchaseFrom,
      selectedAccountId,
      status,
    ],
  );
  const draftMetadata = useMemo(
    () => ({
      title: "New Purchase Note",
      subtitle: selectedVendor?.accountName ?? purchaseFromLabels[purchaseFrom],
      href: "/user/purchase/new-purchase-note",
    }),
    [purchaseFrom, selectedVendor?.accountName],
  );
  const restorePurchaseDraft = (draft: PurchaseNoteDraft) => {
    const lines = Array.isArray(draft.localPurchaseItems)
      ? draft.localPurchaseItems
      : [];
    const fallbackLineId =
      lines.reduce((max, item) => Math.max(max, Number(item.lineId) || 0), 0) +
      1;
    const restoredLineId = Number(draft.nextLineId);

    setSelectedAccountId(draft.selectedAccountId ?? "");
    setPurchaseFrom(normalizePurchaseFrom(draft.purchaseFrom));
    setPaymentTerm(normalizePaymentTerm(draft.paymentTerm));
    setCurrency(normalizeCurrency(draft.currency));
    setDocDate(draft.docDate ?? todayInputValue());
    setStatus(normalizePurchaseStatus(draft.status));
    setLocalPurchaseItems(
      lines.map((item) => ({
        ...item,
        quantity: hasCertificateNo(item.certificateNo) ? "1" : item.quantity,
        parcelOrStone: "STONE",
      })),
    );
    setNextLineId(restoredLineId > 0 ? restoredLineId : fallbackLineId);
    localPurchaseItemPagination.setPage(
      Math.max(1, Math.ceil(lines.length / DEFAULT_PAGE_SIZE)),
    );
  };
  const { saveDraft: savePurchaseDraft } = useFormDraft<PurchaseNoteDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultPurchaseNoteDraft,
    restore: restorePurchaseDraft,
  });

  useEffect(() => {
    const loadVendorAccounts = async () => {
      if (!selectedDepartmentId) {
        setVendorAccounts([]);
        setVendorsLoading(false);
        setVendorsError("Select a department before creating a purchase note.");
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
        setItemsError("Select a department before creating a purchase note.");
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
  }, [selectedDepartmentId]);

  const handlePurchaseFromChange = (value: string) => {
    setPurchaseFrom(normalizePurchaseFrom(value as PurchaseFrom));
  };

  const handleSourceChange = (value: string) => {
    setSelectedAccountId(value);
  };

  const handleDepartmentChange = (departmentId: string) => {
    if (departmentId === selectedDepartmentId) return;

    setSelectedDepartmentId(departmentId);
    setSelectedAccountId("");
    setLocalPurchaseItems([]);
    setNextLineId(1);
    localPurchaseItemPagination.setPage(1);
  };

  const handlePaymentTermChange = (value: string) => {
    const nextPaymentTerm = normalizePaymentTerm(value);
    setPaymentTerm(nextPaymentTerm);
    savePurchaseDraft({ ...draftValues, paymentTerm: nextPaymentTerm });
  };

  const handleInsertLocalProduct = () => {
    if (!selectedDepartmentId) {
      toast.error("Select a department before adding a line.");
      return;
    }

    if (itemsLoading) {
      toast.error("Items are still loading.");
      return;
    }

    if (items.length === 0) {
      toast.error("No items available.");
      return;
    }

    const lineId = nextLineId;
    const nextLength = localPurchaseItems.length + 1;

    setLocalPurchaseItems((items) => [
      ...items,
      {
        lineId,
        itemMasterId: "",
        lotName: "",
        quantity: "",
        weight: "",
        certificateNo: "",
        totalCost: "",
        remark: "",
        parcelOrStone: "STONE",
        departmentAccountName: selectedAccess?.departmentName ?? "",
      },
    ]);
    setNextLineId(lineId + 1);
    localPurchaseItemPagination.setPage(
      Math.max(1, Math.ceil(nextLength / DEFAULT_PAGE_SIZE)),
    );
  };

  const updateLocalPurchaseItem = (
    lineId: number,
    field: LocalPurchaseItemField,
    value: string,
  ) => {
    setLocalPurchaseItems((items) =>
      items.map((item) => {
        if (item.lineId !== lineId) return item;

        if (field === "quantity" && hasCertificateNo(item.certificateNo)) {
          return { ...item, quantity: "1" };
        }

        if (field === "certificateNo") {
          return {
            ...item,
            certificateNo: value,
            quantity: hasCertificateNo(value) ? "1" : item.quantity,
            parcelOrStone: "STONE",
          };
        }

        if (field === "parcelOrStone") {
          return { ...item, parcelOrStone: "STONE" };
        }

        return { ...item, [field]: value };
      }),
    );
  };

  const removeLocalPurchaseItem = (lineId: number) => {
    setLocalPurchaseItems((items) =>
      items.filter((item) => item.lineId !== lineId),
    );
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedDepartmentId) {
      toast.error("Select a department before creating a purchase.");
      return;
    }

    if (!canReadAccounts) {
      toast.error("Account List read permission is required to select a vendor.");
      return;
    }

    if (!sourceSelected) {
      toast.error(`Select a ${sourceFieldLabel.toLowerCase()}.`);
      return;
    }

    if (!isLocalPurchase) {
      toast.error("Only local purchase creation is available now.");
      return;
    }

    if (!selectedVendor) {
      toast.error("Select a vendor account.");
      return;
    }

    if (localPurchaseItems.length === 0) {
      toast.error("Insert at least one product.");
      return;
    }

    const incompleteItem = localPurchaseItems.find(
      (item) =>
        !item.lotName.trim() ||
        !item.itemMasterId ||
        Number(item.quantity) <= 0 ||
        Number(item.weight) <= 0 ||
        Number(item.certificateNo) <= 0 ||
        Number(item.totalCost) <= 0 ||
        !item.parcelOrStone,
    );

    if (incompleteItem) {
      toast.error(`Complete product details for Line ${incompleteItem.lineId}.`);
      return;
    }

    const invalidCertifiedQuantityItem = localPurchaseItems.find(
      (item) => hasCertificateNo(item.certificateNo) && Number(item.quantity) !== 1,
    );

    if (invalidCertifiedQuantityItem) {
      toast.error(
        `Certificate item on Line ${invalidCertifiedQuantityItem.lineId} must have Qty 1.`,
      );
      return;
    }

    try {
      setIsCreating(true);
      const response = await createPurchaseNote("user", {
        purchaseFrom,
        departmentId: selectedDepartmentId,
        vendorAccountId: selectedVendor.id,
        paymentTerm: paymentTerm ? Number(paymentTerm) : null,
        currency,
        docDate,
        status,
        items: localPurchaseItems.map((item) => ({
          lotName: item.lotName,
          itemMasterId: item.itemMasterId,
          quantity: item.quantity,
          weight: item.weight,
          totalCost: item.totalCost,
          labAccountName: selectedAccess?.departmentName ?? "System",
          certificateNo: item.certificateNo,
          parcelOrStone: item.parcelOrStone,
          remark: item.remark,
        })),
      });

      toast.success(`Purchase created: ${response.data.purchaseNote.purchaseNo}`);
      router.push("/user/purchase/purchase-notes");
    } catch (error: unknown) {
      const apiError = error as {
        response?: {
          data?: {
            message?: string;
          };
        };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to create purchase.");
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1500px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Purchase
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              New Purchase Note
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
                {purchaseFromLabels[purchaseFrom]}
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
            <Field label="Purchase From" required>
              <Select
                value={purchaseFrom}
                onValueChange={handlePurchaseFromChange}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Select purchase type" />
                </SelectTrigger>
                <SelectContent>
                  {purchaseFromOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={sourceFieldLabel}
              required
              error={vendorsError ?? undefined}
            >
              <AccountSearchPicker
                value={selectedAccountId}
                onChange={handleSourceChange}
                options={vendorAccounts}
                loading={vendorsLoading}
                disabled={vendorsLoading || vendorAccounts.length === 0}
                placeholder={sourcePlaceholder}
                modalTitle="Search Vendor"
                searchPlaceholder="Search vendor by name, doc ID, phone, email, or tax ID"
                emptyMessage="No vendor accounts found."
              />
              {vendorsLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading vendors
                </div>
              ) : null}
              {!vendorsLoading && vendorAccounts.length === 0 && !vendorsError ? (
                <p className="text-xs text-muted-foreground">
                  No active vendor accounts available.
                </p>
              ) : null}
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
              {purchaseDepartmentOptions.length > 1 ? (
                <Select
                  value={selectedDepartmentId || undefined}
                  onValueChange={handleDepartmentChange}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Select department" />
                  </SelectTrigger>
                  <SelectContent>
                    {purchaseDepartmentOptions.map((access) => (
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
                onValueChange={(value) => setStatus(value as PurchaseStatus)}
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
                    {localPurchaseItems.length} records found
                  </p>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-xl"
                onClick={handleInsertLocalProduct}
                disabled={!selectedDepartmentId || itemsLoading || items.length === 0}
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
                  <p>No item master records found.</p>
                ) : null}
              </div>
            )}

            {localPurchaseItems.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                No data
              </div>
            ) : (
              <div className="space-y-4 p-5">
                {paginatedLocalPurchaseItems.map((item) => (
                  <div key={item.lineId} className="rounded-2xl border bg-muted/20 p-4">
                    <div className="mb-4 flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          Doc Line
                        </p>
                        <p className="text-sm font-semibold">Line {item.lineId}</p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-xl text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => removeLocalPurchaseItem(item.lineId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                      <Field label="ItemID" required>
                        <Select
                          value={item.itemMasterId}
                          onValueChange={(value) =>
                            updateLocalPurchaseItem(
                              item.lineId,
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
                          value={item.parcelOrStone}
                          onValueChange={(value) =>
                            updateLocalPurchaseItem(
                              item.lineId,
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
                          value={item.lotName}
                          onChange={(event) =>
                            updateLocalPurchaseItem(
                              item.lineId,
                              "lotName",
                              event.target.value,
                            )
                          }
                          className="h-10 rounded-xl"
                        />
                      </Field>

                      <Field label="Weight" required>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.weight}
                          onChange={(event) =>
                            updateLocalPurchaseItem(
                              item.lineId,
                              "weight",
                              event.target.value,
                            )
                          }
                          className="h-10 rounded-xl"
                        />
                      </Field>

                      <Field label="Qty" required>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.quantity}
                          onChange={(event) =>
                            updateLocalPurchaseItem(
                              item.lineId,
                              "quantity",
                              event.target.value,
                            )
                          }
                          readOnly={hasCertificateNo(item.certificateNo)}
                          className={`h-10 rounded-xl ${
                            hasCertificateNo(item.certificateNo) ? "bg-muted" : ""
                          }`}
                        />
                      </Field>

                      <Field label="Certificate No" required>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={item.certificateNo}
                          onChange={(event) =>
                            updateLocalPurchaseItem(
                              item.lineId,
                              "certificateNo",
                              event.target.value,
                            )
                          }
                          className="h-10 rounded-xl"
                        />
                      </Field>

                      <Field label="Total Cost" required>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={item.totalCost}
                          onChange={(event) =>
                            updateLocalPurchaseItem(
                              item.lineId,
                              "totalCost",
                              event.target.value,
                            )
                          }
                          className="h-10 rounded-xl"
                        />
                      </Field>

                      <Field label="Department Account Name" required>
                        <Input
                          value={item.departmentAccountName}
                          readOnly
                          className="h-10 rounded-xl bg-muted"
                        />
                      </Field>

                      <Field label="Remark">
                        <Input
                          value={item.remark}
                          onChange={(event) =>
                            updateLocalPurchaseItem(
                              item.lineId,
                              "remark",
                              event.target.value,
                            )
                          }
                          className="h-10 rounded-xl"
                          placeholder="Remark"
                        />
                      </Field>
                    </div>
                  </div>
                ))}
                <Pagination
                  page={localPurchaseItemPagination.page}
                  totalPages={localPurchaseItemPagination.totalPages}
                  start={localPurchaseItemPagination.start}
                  end={localPurchaseItemPagination.end}
                  total={localPurchaseItemPagination.total}
                  onPageChange={localPurchaseItemPagination.setPage}
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
            disabled={!sourceSelected || isCreating}
          >
            {isCreating ? (
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
