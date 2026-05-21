"use client";

import { ArrowLeft, FilePlus2, Loader2, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { getAccounts } from "@/api/services/account.service";
import type { AccountListItem } from "@/api/services/account.service";
import { getInventoryItemByLot } from "@/api/services/inventory.service";
import type { InventoryItemListItem } from "@/api/services/inventory.service";
import { createInvoiceFromInventory } from "@/api/services/invoice.service";
import type { InvoiceStatus, InvoiceType } from "@/api/services/invoice.service";
import { AccountSearchPicker } from "@/components/common/account-search-picker";
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
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useFormDraft } from "@/hooks/use-form-draft";
import { useAppSelector } from "@/store/hooks";
import type { DepartmentAccessOption } from "@/store/types/types";

const invoiceTypeOptions: Array<{ value: InvoiceType; label: string }> = [
  { value: "LOCAL_INVOICE", label: "Local Invoice" },
  { value: "EXPORT_INVOICE", label: "Export Invoice" },
  { value: "INTERNAL_INVOICE", label: "Internal Invoice" },
];

const statusOptions: Array<{ value: InvoiceStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "PENDING", label: "Pending" },
];

function isCustomerAccount(account: AccountListItem) {
  const type = account.accountType.name.trim().toLowerCase();
  return type === "customer" || type === "group customer";
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function departmentOptionLabel(access: DepartmentAccessOption) {
  const company = access.companyCode
    ? `${access.companyName} (${access.companyCode})`
    : access.companyName;
  return `${company} - ${access.departmentName}`;
}

function formatAmount(value: number) {
  return value.toFixed(2);
}

function itemLabel(item: InventoryItemListItem) {
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? "-";
}

function itemDescription(item: InventoryItemListItem) {
  return item.remark ?? `${item.lotName} - Lot ${item.lotId}`;
}

function unitPrice(item: InventoryItemListItem) {
  return item.quantity > 0 ? item.totalCost / item.quantity : item.totalCost;
}

function stockCurrency(item?: InventoryItemListItem | null) {
  return item?.purchase?.currency ?? item?.purchaseNote?.currency ?? "USD";
}

type NewInvoiceDraft = {
  accountId: string;
  destinationDepartmentId: string;
  referenceDocNo: string;
  invoiceType: InvoiceType;
  docDate: string;
  status: InvoiceStatus;
  lotId: string;
  remark: string;
};

function defaultNewInvoiceDraft(): NewInvoiceDraft {
  return {
    accountId: "",
    destinationDepartmentId: "",
    referenceDocNo: "",
    invoiceType: "LOCAL_INVOICE",
    docDate: todayInputValue(),
    status: "ACTIVE",
    lotId: "",
    remark: "",
  };
}

function normalizeInvoiceType(value?: InvoiceType) {
  return invoiceTypeOptions.some((option) => option.value === value)
    ? (value as InvoiceType)
    : "LOCAL_INVOICE";
}

function normalizeInvoiceStatus(value?: InvoiceStatus) {
  return statusOptions.some((option) => option.value === value)
    ? (value as InvoiceStatus)
    : "ACTIVE";
}

export default function NewInvoicePage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const selectedDepartmentId =
    user?.selectedDepartmentId ?? departmentAccesses[0]?.departmentId ?? null;
  const selectedAccess =
    departmentAccesses.find(
      (access) => access.departmentId === selectedDepartmentId,
    ) ?? departmentAccesses[0];
  const currentCompany = useMemo(() => {
    if (!selectedCompanyId && selectedAccess) {
      return {
        id: selectedAccess.companyId,
        name: selectedAccess.companyName,
        code: selectedAccess.companyCode,
        status: selectedAccess.companyStatus,
      };
    }

    return (
      accessibleCompanies.find((company) => company.id === selectedCompanyId) ??
      (selectedAccess
        ? {
            id: selectedAccess.companyId,
            name: selectedAccess.companyName,
            code: selectedAccess.companyCode,
            status: selectedAccess.companyStatus,
          }
        : null)
    );
  }, [accessibleCompanies, selectedAccess, selectedCompanyId]);
  const internalDepartmentOptions = useMemo(
    () =>
      departmentAccesses.filter(
        (access) =>
          access.companyId !== currentCompany?.id &&
          access.companyStatus !== "INACTIVE" &&
          permissionAllows(
            permissionsToMap(access.permissions).INVENTORY_LIST,
            "READ_ONLY",
          ),
      ),
    [currentCompany?.id, departmentAccesses],
  );
  const permissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : persistedPermissions;
  const canCreateInvoice = permissionAllows(permissionMap.NEW_INVOICE, "READ_WRITE");

  const [customerAccounts, setCustomerAccounts] = useState<AccountListItem[]>([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [accountId, setAccountId] = useState("");
  const [destinationDepartmentId, setDestinationDepartmentId] = useState("");
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("LOCAL_INVOICE");
  const [docDate, setDocDate] = useState(todayInputValue());
  const [status, setStatus] = useState<InvoiceStatus>("ACTIVE");
  const [lotId, setLotId] = useState("");
  const [lotItem, setLotItem] = useState<InventoryItemListItem | null>(null);
  const [lotLookupLoading, setLotLookupLoading] = useState(false);
  const [lotLookupError, setLotLookupError] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescriptionValue, setItemDescriptionValue] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unitPriceValue, setUnitPriceValue] = useState("");
  const [remark, setRemark] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isInternalInvoice = invoiceType === "INTERNAL_INVOICE";
  const selectedCustomer = customerAccounts.find((account) => account.id === accountId);
  const selectedInternalDestination = internalDepartmentOptions.find(
    (access) => access.departmentId === destinationDepartmentId,
  );
  const subtotal = lotItem?.totalCost ?? (Number(quantity) || 0) * (Number(unitPriceValue) || 0);
  const draftKey =
    selectedDepartmentId && currentCompany?.id
      ? `ims:draft:new-invoice:${selectedDepartmentId}:${currentCompany.id}`
      : null;
  const draftValues = useMemo<NewInvoiceDraft>(
    () => ({
      accountId,
      destinationDepartmentId,
      referenceDocNo,
      invoiceType,
      docDate,
      status,
      lotId,
      remark,
    }),
    [
      accountId,
      destinationDepartmentId,
      docDate,
      invoiceType,
      lotId,
      referenceDocNo,
      remark,
      status,
    ],
  );
  const draftMetadata = useMemo(
    () => ({
      title: "New Invoice",
      subtitle:
        selectedCustomer?.accountName ??
        selectedInternalDestination?.departmentName ??
        (lotId ? `Lot ${lotId}` : "Invoice draft"),
      href: "/user/invoice/new-invoice",
    }),
    [
      lotId,
      selectedCustomer?.accountName,
      selectedInternalDestination?.departmentName,
    ],
  );
  useFormDraft<NewInvoiceDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultNewInvoiceDraft,
    restore: (draft) => {
      setAccountId(draft.accountId ?? "");
      setDestinationDepartmentId(draft.destinationDepartmentId ?? "");
      setReferenceDocNo(draft.referenceDocNo ?? "");
      setInvoiceType(normalizeInvoiceType(draft.invoiceType));
      setDocDate(draft.docDate ?? todayInputValue());
      setStatus(normalizeInvoiceStatus(draft.status));
      setLotId(draft.lotId ?? "");
      setRemark(draft.remark ?? "");
      setLotItem(null);
      setLotLookupError(null);
    },
  });

  useEffect(() => {
    const loadCustomerAccounts = async () => {
      if (!selectedDepartmentId) {
        setCustomerAccounts([]);
        setCustomersLoading(false);
        setCustomersError("Select a department before creating an invoice.");
        return;
      }

      try {
        setCustomersLoading(true);
        setCustomersError(null);
        const response = await getAccounts("user", {
          departmentId: selectedDepartmentId,
          status: "ACTIVE",
        });
        setCustomerAccounts(
          (response.data.accounts ?? []).filter(isCustomerAccount),
        );
      } catch {
        setCustomerAccounts([]);
        setCustomersError("Failed to load customer accounts.");
      } finally {
        setCustomersLoading(false);
      }
    };

    loadCustomerAccounts();
  }, [selectedDepartmentId]);

  useEffect(() => {
    const value = lotId.trim();
    setLotLookupError(null);
    setLotItem(null);

    if (!value) {
      setItemName("");
      setItemDescriptionValue("");
      setQuantity("");
      setUnitPriceValue("");
      return;
    }

    const parsedLotId = Number(value);
    if (!selectedDepartmentId || !Number.isInteger(parsedLotId) || parsedLotId <= 0) {
      setLotLookupError("Enter a valid Lot ID.");
      setItemName("");
      setItemDescriptionValue("");
      setQuantity("");
      setUnitPriceValue("");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLotLookupLoading(true);
        const response = await getInventoryItemByLot("user", parsedLotId, {
          departmentId: selectedDepartmentId,
        });
        const item = response.data.inventoryItem as InventoryItemListItem;
        setLotItem(item);
        setItemName(itemLabel(item));
        setItemDescriptionValue(itemDescription(item));
        setQuantity(String(item.quantity));
        setUnitPriceValue(formatAmount(unitPrice(item)));
      } catch (error: unknown) {
        const apiError = error as {
          response?: { data?: { message?: string } };
        };
        setLotLookupError(
          apiError.response?.data?.message ?? "Failed to load Lot ID item.",
        );
        setItemName("");
        setItemDescriptionValue("");
        setQuantity("");
        setUnitPriceValue("");
      } finally {
        setLotLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [lotId, selectedDepartmentId]);

  const handleInvoiceTypeChange = (value: InvoiceType) => {
    const nextType = normalizeInvoiceType(value);
    setInvoiceType(nextType);
    setAccountId("");
    setDestinationDepartmentId("");
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedDepartmentId) {
      toast.error("Select a department before creating an invoice.");
      return;
    }

    if (isInternalInvoice && !selectedInternalDestination) {
      toast.error("Select a destination department for the internal invoice.");
      return;
    }

    if (!isInternalInvoice && !selectedCustomer) {
      toast.error("Select a customer account.");
      return;
    }

    if (!referenceDocNo.trim()) {
      toast.error("Enter Reference Doc No.");
      return;
    }

    if (!lotItem) {
      toast.error("Enter a valid stock Lot ID.");
      return;
    }

    try {
      setIsSaving(true);
      const response = await createInvoiceFromInventory("user", {
        departmentId: selectedDepartmentId,
        inventoryItemId: lotItem.id,
        accountId: !isInternalInvoice ? selectedCustomer?.id : undefined,
        sourceCompanyId: isInternalInvoice
          ? selectedInternalDestination?.companyId
          : undefined,
        destinationDepartmentId: isInternalInvoice
          ? selectedInternalDestination?.departmentId
          : undefined,
        referenceDocNo: referenceDocNo.trim(),
        invoiceType,
        docDate,
        status,
        currency: stockCurrency(lotItem),
        remark: remark.trim() || undefined,
      });

      toast.success(`Invoice created: ${response.data.invoice.invoiceNo}`);
      router.push("/user/invoice/invoices");
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to create invoice.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!canCreateInvoice) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create invoices in this department.
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
              Invoice
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">New Invoice</h1>
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
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
              <FilePlus2 className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Header</h2>
              <p className="text-xs text-muted-foreground">
                {selectedAccess?.departmentName ?? "No department selected"}
              </p>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-5">
            <Field label="Invoice Type" required>
              <Select
                value={invoiceType}
                onValueChange={(value) =>
                  handleInvoiceTypeChange(value as InvoiceType)
                }
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {invoiceTypeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field
              label={isInternalInvoice ? "Company / Department" : "Customer"}
              required
              error={!isInternalInvoice ? customersError ?? undefined : undefined}
            >
              {isInternalInvoice ? (
                <Select
                  value={destinationDepartmentId || undefined}
                  onValueChange={setDestinationDepartmentId}
                  disabled={internalDepartmentOptions.length === 0}
                >
                  <SelectTrigger className="h-10 w-full rounded-xl">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    {internalDepartmentOptions.map((access) => (
                      <SelectItem
                        key={access.departmentId}
                        value={access.departmentId}
                      >
                        {departmentOptionLabel(access)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <AccountSearchPicker
                  value={accountId}
                  onChange={setAccountId}
                  options={customerAccounts}
                  loading={customersLoading}
                  disabled={customersLoading || customerAccounts.length === 0}
                  placeholder={
                    customersLoading ? "Loading customers..." : "Select customer"
                  }
                  modalTitle="Search Customer"
                  searchPlaceholder="Search customer by name, doc ID, phone, email, or tax ID"
                  emptyMessage="No customer accounts found."
                />
              )}
            </Field>

            <Field label="Reference Doc No" required>
              <Input
                value={referenceDocNo}
                onChange={(event) => setReferenceDocNo(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="REF-2026-001"
              />
            </Field>

            <Field label="Invoice Date">
              <Input
                type="date"
                value={docDate}
                onChange={(event) => setDocDate(event.target.value)}
                className="h-10 rounded-xl"
              />
            </Field>

            <Field label="Status">
              <Select value={status} onValueChange={(value) => setStatus(value as InvoiceStatus)}>
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {selectedCustomer && !isInternalInvoice && (
            <div className="border-t bg-muted/20 p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
                <Field label="Customer Name">
                  <Input value={selectedCustomer.accountName} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Account Doc ID">
                  <Input value={selectedCustomer.accountIndex ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Address">
                  <Input value={selectedCustomer.address ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Contact Number">
                  <Input value={selectedCustomer.phone1 ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Email">
                  <Input value={selectedCustomer.email ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Tax ID">
                  <Input value={selectedCustomer.trnNo ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
              </div>
            </div>
          )}

          {selectedInternalDestination && isInternalInvoice && (
            <div className="border-t bg-muted/20 p-5">
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <Field label="Company Name">
                  <Input value={selectedInternalDestination.companyName} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Company Code">
                  <Input value={selectedInternalDestination.companyCode ?? ""} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
                <Field label="Department">
                  <Input value={selectedInternalDestination.departmentName} readOnly className="h-10 rounded-xl bg-background" />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Item Details</h2>
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
                />
                {lotLookupLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>
            <Field label="Item Name" required>
              <Input value={itemName} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Item Description">
              <Input value={itemDescriptionValue} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Quantity" required>
              <Input value={quantity} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Unit Price" required>
              <Input value={unitPriceValue} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Total Amount">
              <Input value={formatAmount(subtotal)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Remark">
              <Input value={remark} onChange={(event) => setRemark(event.target.value)} className="h-10 rounded-xl" />
            </Field>
            <Field label="Grand Total">
              <Input value={formatAmount(subtotal)} readOnly className="h-10 rounded-xl bg-muted font-semibold" />
            </Field>
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-9 rounded-xl" onClick={() => router.back()}>
            Close
          </Button>
          <Button type="submit" className="h-9 rounded-xl" disabled={isSaving || lotLookupLoading}>
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save & Close
          </Button>
        </div>
      </form>
    </div>
  );
}
