"use client";

import { ArrowRightLeft, FilePlus2, Loader2, RotateCcw, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getInventoryItems,
  returnInventoryItems,
} from "@/api/services/inventory.service";
import { getAccounts } from "@/api/services/account.service";
import type { AccountListItem } from "@/api/services/account.service";
import type { InventoryItemListItem } from "@/api/services/inventory.service";
import { createInvoiceFromInventory } from "@/api/services/invoice.service";
import type { InvoiceStatus, InvoiceType } from "@/api/services/invoice.service";
import type { TransferListItem } from "@/api/services/transfer.service";
import TransferForm from "@/components/transfer/TransferForm";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import Pagination from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";
import { useAppSelector } from "@/store/hooks";
import type { DepartmentAccessOption } from "@/store/types/types";

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function itemLabel(item: InventoryItemListItem) {
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? "-";
}

function StatusText({ status }: { status: InventoryItemListItem["status"] }) {
  const styles: Record<InventoryItemListItem["status"], string> = {
    STOCK: "text-emerald-600",
    MEMO: "text-rose-600",
    SOLD: "text-blue-600",
    RETURNED: "text-slate-600",
  };

  return <span className={`font-semibold ${styles[status]}`}>{status}</span>;
}

type InventoryDocument =
  | NonNullable<InventoryItemListItem["originDocument"]>
  | NonNullable<InventoryItemListItem["purchase"]>
  | NonNullable<InventoryItemListItem["purchaseReturn"]>
  | NonNullable<InventoryItemListItem["memo"]>
  | NonNullable<InventoryItemListItem["memoReturn"]>;

function originDocument(item: InventoryItemListItem) {
  return item.originDocument ?? item.originMemo ?? item.memo ?? item.purchase ?? null;
}

function purchaseDocument(item: InventoryItemListItem) {
  return item.purchase ?? item.purchaseNote ?? null;
}

function returnDocument(item: InventoryItemListItem) {
  return item.purchaseReturn ?? item.memoReturn ?? null;
}

function stockDocument(item: InventoryItemListItem) {
  return purchaseDocument(item) ?? originDocument(item);
}

function documentNo(document?: InventoryDocument | null) {
  if (!document) return null;
  return "purchaseNo" in document ? document.purchaseNo : document.memoNo;
}

function formatDate(value?: string | null) {
  if (!value) return "-";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatPaymentTerm(value?: number | null) {
  if (!value) return "-";
  return `${value} ${value === 1 ? "Day" : "Days"}`;
}

function companyLabel(company: InventoryItemListItem["company"]) {
  return company.code ? `${company.name} (${company.code})` : company.name;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

const NO_CUSTOMER = "__NONE__";

const invoiceTypeOptions: Array<{ value: InvoiceType; label: string }> = [
  { value: "LOCAL_INVOICE", label: "Local Invoice" },
  { value: "EXPORT_INVOICE", label: "Export Invoice" },
  { value: "INTERNAL_INVOICE", label: "Internal Invoice" },
];

const invoiceStatusOptions: Array<{ value: InvoiceStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "PENDING", label: "Pending" },
];

function isCustomerAccount(account: AccountListItem) {
  const type = account.accountType.name.trim().toLowerCase();
  return type === "customer" || type === "group customer";
}

function accountLabel(account: AccountListItem) {
  return `${account.accountName} (${account.accountIndex ?? "No docId"})`;
}

function departmentOptionLabel(access: DepartmentAccessOption) {
  const company = access.companyCode
    ? `${access.companyName} (${access.companyCode})`
    : access.companyName;
  return `${company} - ${access.departmentName}`;
}

function itemDescription(item: InventoryItemListItem) {
  return item.remark ?? `${item.lotName} - Lot ${item.lotId}`;
}

function unitPrice(item: InventoryItemListItem) {
  return item.quantity > 0 ? item.totalCost / item.quantity : item.totalCost;
}

export default function InventoryListPage() {
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
  const [inventoryItems, setInventoryItems] = useState<InventoryItemListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnDocDate, setReturnDocDate] = useState(todayInputValue());
  const [returnReferenceDocNo, setReturnReferenceDocNo] = useState("");
  const [isReturning, setIsReturning] = useState(false);
  const [customerAccounts, setCustomerAccounts] = useState<AccountListItem[]>([]);
  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceItem, setInvoiceItem] = useState<InventoryItemListItem | null>(null);
  const [invoiceReferenceDocNo, setInvoiceReferenceDocNo] = useState("");
  const [invoiceType, setInvoiceType] = useState<InvoiceType>("LOCAL_INVOICE");
  const [invoiceAccountId, setInvoiceAccountId] = useState("");
  const [invoiceDestinationDepartmentId, setInvoiceDestinationDepartmentId] =
    useState("");
  const [invoiceDocDate, setInvoiceDocDate] = useState(todayInputValue());
  const [invoiceStatus, setInvoiceStatus] = useState<InvoiceStatus>("ACTIVE");
  const [invoiceRemark, setInvoiceRemark] = useState("");
  const [isCreatingInvoice, setIsCreatingInvoice] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [transferItem, setTransferItem] = useState<InventoryItemListItem | null>(
    null,
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
  const accessByDepartmentId = useMemo(
    () =>
      new Map(
        departmentAccesses.map((access) => [
          access.departmentId,
          permissionsToMap(access.permissions),
        ]),
      ),
    [departmentAccesses],
  );
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
  const companyDepartmentAccesses = useMemo(
    () =>
      departmentAccesses.filter(
        (access) => access.companyId === currentCompany?.id,
      ),
    [currentCompany?.id, departmentAccesses],
  );
  const canReadInventory = currentCompany
    ? companyDepartmentAccesses.some((access) =>
        permissionAllows(
          permissionsToMap(access.permissions).INVENTORY_LIST,
          "READ_ONLY",
        ),
      )
    : permissionAllows(permissionMap.INVENTORY_LIST, "READ_ONLY");
  const hasAnyReturnInventory = companyDepartmentAccesses.some((access) =>
    permissionAllows(
      permissionsToMap(access.permissions).NEW_PURCH_NOTE_RTN,
      "READ_WRITE",
    ),
  );
  const hasAnyCreateInvoice = companyDepartmentAccesses.some((access) =>
    permissionAllows(
      permissionsToMap(access.permissions).NEW_INVOICE,
      "READ_WRITE",
    ),
  );
  const hasAnyTransfer = companyDepartmentAccesses.some((access) =>
    permissionAllows(
      permissionsToMap(access.permissions).NEW_TRANSFER,
      "READ_WRITE",
    ),
  );
  const canReturnInventoryForDepartment = (departmentId?: string | null) =>
    permissionAllows(
      departmentId
        ? accessByDepartmentId.get(departmentId)?.NEW_PURCH_NOTE_RTN
        : undefined,
      "READ_WRITE",
    );
  const canCreateInvoiceForDepartment = (departmentId?: string | null) =>
    permissionAllows(
      departmentId
        ? accessByDepartmentId.get(departmentId)?.NEW_INVOICE
        : undefined,
      "READ_WRITE",
    );
  const canTransferForDepartment = (departmentId?: string | null) =>
    permissionAllows(
      departmentId
        ? accessByDepartmentId.get(departmentId)?.NEW_TRANSFER
        : undefined,
      "READ_WRITE",
    );
  const canSelectItem = (item: InventoryItemListItem) =>
    canReturnInventoryForDepartment(item.department?.id) ||
    canCreateInvoiceForDepartment(item.department?.id) ||
    canTransferForDepartment(item.department?.id);
  const canSelectInventory =
    hasAnyReturnInventory || hasAnyCreateInvoice || hasAnyTransfer;
  const isInternalInvoice = invoiceType === "INTERNAL_INVOICE";
  const selectedInvoiceCustomer = customerAccounts.find(
    (account) => account.id === invoiceAccountId,
  );
  const selectedInvoiceDestination = internalDepartmentOptions.find(
    (access) => access.departmentId === invoiceDestinationDepartmentId,
  );

  useEffect(() => {
    if (!canReadInventory || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadInventoryItems = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getInventoryItems("user", {
          companyId: currentCompany?.id,
        });
        setInventoryItems(response.data.inventoryItems ?? []);
      } catch {
        setError("Failed to load inventory.");
      } finally {
        setLoading(false);
      }
    };

    loadInventoryItems();
  }, [canReadInventory, currentCompany?.id]);

  useEffect(() => {
    const availableIds = new Set(inventoryItems.map((item) => item.id));
    setSelectedItemIds((ids) => ids.filter((id) => availableIds.has(id)));
  }, [inventoryItems]);

  useEffect(() => {
    const loadCustomerAccounts = async () => {
      const invoiceDepartmentId = invoiceItem?.department?.id;

      if (
        !invoiceModalOpen ||
        !invoiceDepartmentId ||
        !canCreateInvoiceForDepartment(invoiceDepartmentId)
      ) {
        setCustomerAccounts([]);
        return;
      }

      try {
        const response = await getAccounts("user", {
          departmentId: invoiceDepartmentId,
          status: "ACTIVE",
        });
        setCustomerAccounts(
          (response.data.accounts ?? []).filter(isCustomerAccount),
        );
      } catch {
        setCustomerAccounts([]);
      }
    };

    loadCustomerAccounts();
  }, [accessByDepartmentId, invoiceItem, invoiceModalOpen]);

  const filteredInventoryItems = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return inventoryItems;

    return inventoryItems.filter((item) =>
      [
        item.itemId,
        item.itemMaster?.itemId,
        item.itemMaster?.itemName,
        item.itemMaster?.itemType,
        item.itemType,
        item.lotId,
        originDocument(item)?.docId,
        documentNo(originDocument(item)),
        purchaseDocument(item)?.docId,
        documentNo(purchaseDocument(item)),
        returnDocument(item)?.docId,
        documentNo(returnDocument(item)),
        item.lotName,
        item.labAccountName,
        item.certificateNo,
        item.locationAccountName,
        item.department?.name,
        item.company?.name,
        item.company?.code,
        item.status,
        item.remark,
        item.vendorAccount?.accountName,
        stockDocument(item)?.status,
        stockDocument(item)?.paymentTerm,
        stockDocument(item)?.currency,
      ]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(value)),
    );
  }, [inventoryItems, search]);
  const {
    paginatedItems: paginatedInventoryItems,
    ...inventoryPagination
  } = usePagination(filteredInventoryItems);

  const selectedInventoryItems = useMemo(
    () => inventoryItems.filter((item) => selectedItemIds.includes(item.id)),
    [inventoryItems, selectedItemIds],
  );
  const selectedTotals = useMemo(
    () =>
      selectedInventoryItems.reduce(
        (total, item) => ({
          quantity: total.quantity + item.quantity,
          weight: total.weight + item.weight,
          cost: total.cost + item.totalCost,
        }),
        { quantity: 0, weight: 0, cost: 0 },
      ),
    [selectedInventoryItems],
  );
  const selectedVendorIds = useMemo(
    () =>
      new Set(
        selectedInventoryItems.map(
          (item) => item.vendorAccount?.id ?? "__MISSING__",
        ),
      ),
    [selectedInventoryItems],
  );
  const selectedVendorNames = useMemo(
    () =>
      [
        ...new Set(
          selectedInventoryItems.map(
            (item) => item.vendorAccount?.accountName ?? "-",
          ),
        ),
      ],
    [selectedInventoryItems],
  );
  const selectedCompanyNames = useMemo(
    () =>
      [...new Set(selectedInventoryItems.map((item) => companyLabel(item.company)))],
    [selectedInventoryItems],
  );
  const hasVendorIssue =
    selectedInventoryItems.length > 0 &&
    (selectedVendorIds.size !== 1 || selectedVendorIds.has("__MISSING__"));
  const selectedDepartmentIds = useMemo(
    () =>
      new Set(
        selectedInventoryItems.map(
          (item) => item.department?.id ?? "__MISSING__",
        ),
      ),
    [selectedInventoryItems],
  );
  const selectedSourceDepartmentId =
    selectedDepartmentIds.size === 1
      ? [...selectedDepartmentIds][0]
      : null;
  const hasDepartmentIssue =
    selectedInventoryItems.length > 0 &&
    (selectedDepartmentIds.size !== 1 ||
      selectedDepartmentIds.has("__MISSING__"));
  const selectedCanReturn =
    Boolean(selectedSourceDepartmentId) &&
    !hasDepartmentIssue &&
    canReturnInventoryForDepartment(selectedSourceDepartmentId);
  const selectedCanCreateInvoice =
    selectedInventoryItems.length === 1 &&
    canCreateInvoiceForDepartment(selectedInventoryItems[0]?.department?.id);
  const selectedCanTransfer =
    selectedInventoryItems.length === 1 &&
    canTransferForDepartment(selectedInventoryItems[0]?.department?.id);
  const selectablePaginatedItems = useMemo(
    () => paginatedInventoryItems.filter(canSelectItem),
    [accessByDepartmentId, paginatedInventoryItems],
  );
  const allFilteredSelected =
    selectablePaginatedItems.length > 0 &&
    selectablePaginatedItems.every((item) => selectedItemIds.includes(item.id));

  const toggleItemSelection = (itemId: string, checked: boolean) => {
    setSelectedItemIds((ids) =>
      checked
        ? ids.includes(itemId)
          ? ids
          : [...ids, itemId]
        : ids.filter((id) => id !== itemId),
    );
  };

  const toggleFilteredSelection = (checked: boolean) => {
    const visibleIds = selectablePaginatedItems.map((item) => item.id);
    setSelectedItemIds((ids) => {
      if (!checked) return ids.filter((id) => !visibleIds.includes(id));
      return [...new Set([...ids, ...visibleIds])];
    });
  };

  const openReturnModal = () => {
    if (selectedInventoryItems.length === 0) {
      toast.error("Select at least one inventory item.");
      return;
    }

    if (hasDepartmentIssue || !selectedCanReturn) {
      toast.error("Select returnable stock from one department.");
      return;
    }

    setReturnModalOpen(true);
  };

  const closeReturnModal = () => {
    if (isReturning) return;
    setReturnModalOpen(false);
  };

  const handleReturnSelected = async () => {
    if (!selectedSourceDepartmentId || hasDepartmentIssue) {
      toast.error("Select a department before returning stock items.");
      return;
    }

    if (selectedInventoryItems.length === 0) {
      toast.error("Select at least one inventory item.");
      return;
    }

    if (hasVendorIssue) {
      toast.error("Select stock items from one vendor only.");
      return;
    }

    try {
      setIsReturning(true);
      const response = await returnInventoryItems("user", {
        departmentId: selectedSourceDepartmentId,
        itemIds: selectedItemIds,
        docDate: returnDocDate,
        referenceDocNo: returnReferenceDocNo,
      });

      const returnedIds = new Set(selectedItemIds);
      setInventoryItems((items) =>
        items.filter((item) => !returnedIds.has(item.id)),
      );
      setSelectedItemIds([]);
      setReturnReferenceDocNo("");
      setReturnDocDate(todayInputValue());
      setReturnModalOpen(false);
      toast.success(
        `Purchase return created: ${response.data.purchaseNote.purchaseNo}`,
      );
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ?? "Failed to return inventory items.",
      );
    } finally {
      setIsReturning(false);
    }
  };

  const openInvoiceModal = (item: InventoryItemListItem) => {
    if (!canCreateInvoiceForDepartment(item.department?.id)) {
      toast.error("You do not have invoice write access for this item department.");
      return;
    }

    setInvoiceItem(item);
    setInvoiceReferenceDocNo("");
    setInvoiceType("LOCAL_INVOICE");
    setInvoiceAccountId("");
    setInvoiceDestinationDepartmentId("");
    setInvoiceDocDate(todayInputValue());
    setInvoiceStatus("ACTIVE");
    setInvoiceRemark("");
    setInvoiceModalOpen(true);
  };

  const handleInvoiceTypeChange = (value: InvoiceType) => {
    setInvoiceType(value);
    setInvoiceAccountId("");
    setInvoiceDestinationDepartmentId("");
  };

  const openSelectedInvoiceModal = () => {
    if (selectedInventoryItems.length !== 1) {
      toast.error("Select exactly one inventory item to create an invoice.");
      return;
    }

    const [item] = selectedInventoryItems;
    if (item.status !== "STOCK") {
      toast.error("Only stock items can be invoiced.");
      return;
    }

    if (!selectedCanCreateInvoice) {
      toast.error("You do not have invoice write access for this item department.");
      return;
    }

    openInvoiceModal(item);
  };

  const closeInvoiceModal = () => {
    if (isCreatingInvoice) return;
    setInvoiceModalOpen(false);
  };

  const openTransferModal = (item: InventoryItemListItem) => {
    if (!canTransferForDepartment(item.department?.id)) {
      toast.error("You do not have transfer write access for this item department.");
      return;
    }

    setTransferItem(item);
    setTransferModalOpen(true);
  };

  const openSelectedTransferModal = () => {
    if (selectedInventoryItems.length !== 1) {
      toast.error("Select exactly one inventory item to transfer.");
      return;
    }

    const [item] = selectedInventoryItems;
    if (item.status !== "STOCK") {
      toast.error("Only stock items can be transferred.");
      return;
    }

    if (!selectedCanTransfer) {
      toast.error("You do not have transfer write access for this item department.");
      return;
    }

    openTransferModal(item);
  };

  const closeTransferModal = () => {
    setTransferModalOpen(false);
    setTransferItem(null);
  };

  const handleTransferCreated = (transfer: TransferListItem) => {
    const movedItem = transfer.inventoryItem;

    if (movedItem) {
      setInventoryItems((items) =>
        items.map((item) => (item.id === movedItem.id ? movedItem : item)),
      );
      setSelectedItemIds((ids) => ids.filter((id) => id !== movedItem.id));
    }

    closeTransferModal();
  };

  const handleCreateInvoiceFromInventory = async () => {
    const invoiceDepartmentId = invoiceItem?.department?.id;

    if (!invoiceDepartmentId) {
      toast.error("Select a department before creating an invoice.");
      return;
    }

    if (!invoiceItem) {
      toast.error("Select an inventory item.");
      return;
    }

    if (!invoiceReferenceDocNo.trim()) {
      toast.error("Reference Doc No is required.");
      return;
    }

    if (isInternalInvoice && !selectedInvoiceDestination) {
      toast.error("Select a destination department for the internal invoice.");
      return;
    }

    if (!isInternalInvoice && !selectedInvoiceCustomer) {
      toast.error("Select a customer for the invoice.");
      return;
    }

    try {
      setIsCreatingInvoice(true);
      const response = await createInvoiceFromInventory("user", {
        departmentId: invoiceDepartmentId,
        inventoryItemId: invoiceItem.id,
        accountId: !isInternalInvoice ? selectedInvoiceCustomer?.id : undefined,
        sourceCompanyId: isInternalInvoice
          ? selectedInvoiceDestination?.companyId
          : undefined,
        destinationDepartmentId: isInternalInvoice
          ? selectedInvoiceDestination?.departmentId
          : undefined,
        referenceDocNo: invoiceReferenceDocNo.trim(),
        invoiceType,
        docDate: invoiceDocDate,
        currency: stockDocument(invoiceItem)?.currency ?? "USD",
        status: invoiceStatus,
        remark: invoiceRemark.trim() || undefined,
      });

      setInventoryItems((items) =>
        items.filter((item) => item.id !== invoiceItem.id),
      );
      setSelectedItemIds((ids) => ids.filter((id) => id !== invoiceItem.id));
      setInvoiceModalOpen(false);
      toast.success(`Invoice created: ${response.data.invoice.invoiceNo}`);
      router.push("/user/invoice/invoices");
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ??
          "Failed to create invoice from inventory.",
      );
    } finally {
      setIsCreatingInvoice(false);
    }
  };

  if (!canReadInventory) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view inventory in this company.
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
              Stocks
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Inventory List
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredInventoryItems.length} purchased stock records found
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {hasAnyCreateInvoice && (
              <Button
                className="h-9 rounded-xl"
                disabled={!selectedCanCreateInvoice}
                onClick={openSelectedInvoiceModal}
              >
                <FilePlus2 className="h-4 w-4" />
                Create Invoice
              </Button>
            )}

            {hasAnyTransfer && (
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                disabled={!selectedCanTransfer}
                onClick={openSelectedTransferModal}
              >
                <ArrowRightLeft className="h-4 w-4" />
                Transfer
              </Button>
            )}

            {hasAnyReturnInventory && (
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                disabled={
                  selectedInventoryItems.length === 0 ||
                  !selectedCanReturn ||
                  hasDepartmentIssue
                }
                onClick={openReturnModal}
              >
                <RotateCcw className="h-4 w-4" />
                Return Selected
              </Button>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search purchased stock"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading inventory...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredInventoryItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No inventory items found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2400px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    {canSelectInventory && (
                      <th className="w-12 px-3 py-3 font-medium">
                        <input
                          type="checkbox"
                          aria-label="Select all visible inventory items"
                          checked={allFilteredSelected}
                          onChange={(event) =>
                            toggleFilteredSelection(event.target.checked)
                          }
                          className="h-4 w-4 rounded border-input"
                        />
                      </th>
                    )}
                    <th className="px-3 py-3 font-medium">Item ID</th>
                    <th className="px-3 py-3 font-medium">Origin Doc ID</th>
                    <th className="px-3 py-3 font-medium">Purchase Doc ID</th>
                    <th className="px-3 py-3 font-medium">Return Doc ID</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Lot Name</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 font-medium">Lab</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 font-medium">Parcel / Stone</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Location Account</th>
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Vendor</th>
                    <th className="px-3 py-3 font-medium">Lot Status</th>
                    <th className="px-3 py-3 text-right font-medium">Total Cost</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Doc Status</th>
                    <th className="px-3 py-3 font-medium">Payment Terms</th>
                    <th className="px-3 py-3 font-medium">Currency</th>
                    <th className="px-3 py-3 font-medium">Remark</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedInventoryItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      {canSelectInventory && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select lot ${item.lotId}`}
                            checked={selectedItemIds.includes(item.id)}
                            disabled={!canSelectItem(item)}
                            onChange={(event) =>
                              toggleItemSelection(item.id, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-input"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">
                        {itemLabel(item)}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-blue-600">
                          {originDocument(item)?.docId ?? "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-blue-600">
                          {purchaseDocument(item)?.docId ?? "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-blue-600">
                          {returnDocument(item)?.docId ?? "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-blue-600">
                          {item.lotId}
                        </span>
                      </td>
                      <td className="px-3 py-3">{item.lotName}</td>
                      <td className="px-3 py-3 text-right">{item.quantity}</td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(item.weight, 4)}
                      </td>
                      <td className="px-3 py-3">{item.labAccountName || "-"}</td>
                      <td className="px-3 py-3">
                        <span className="font-medium text-blue-600">
                          {item.certificateNo || "-"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {item.parcelOrStone === "PARCEL" ? "Parcel" : "Stone"}
                      </td>
                      <td className="px-3 py-3">{item.department?.name ?? "-"}</td>
                      <td className="px-3 py-3">{item.locationAccountName}</td>
                      <td className="px-3 py-3">{companyLabel(item.company)}</td>
                      <td className="px-3 py-3">
                        {item.vendorAccount?.accountName ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusText status={item.status} />
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(item.totalCost)}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(stockDocument(item)?.docDate)}
                      </td>
                      <td className="px-3 py-3">
                        {stockDocument(item)?.status ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {formatPaymentTerm(stockDocument(item)?.paymentTerm)}
                      </td>
                      <td className="px-3 py-3">
                        {stockDocument(item)?.currency ?? "-"}
                      </td>
                      <td className="px-3 py-3">{item.remark ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={inventoryPagination.page}
              totalPages={inventoryPagination.totalPages}
              start={inventoryPagination.start}
              end={inventoryPagination.end}
              total={inventoryPagination.total}
              onPageChange={inventoryPagination.setPage}
            />
          </div>
        )}
      </div>

      <Modal
        open={returnModalOpen}
        onClose={closeReturnModal}
        title="Return Inventory Items"
        subtitle={`${selectedInventoryItems.length} selected`}
        icon={<RotateCcw className="h-4 w-4" />}
        maxWidth="xl"
      >
        <ModalBody className="space-y-5">
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Qty
              </p>
              <p className="mt-1 font-semibold">{selectedTotals.quantity}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Weight
              </p>
              <p className="mt-1 font-semibold">
                {formatNumber(selectedTotals.weight, 4)}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Total Cost
              </p>
              <p className="mt-1 font-semibold">
                {formatNumber(selectedTotals.cost)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Company">
              <Input
                value={selectedCompanyNames.join(", ")}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Vendor">
              <Input
                value={selectedVendorNames.join(", ")}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Doc Date">
              <Input
                type="date"
                value={returnDocDate}
                onChange={(event) => setReturnDocDate(event.target.value)}
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Reference Doc No">
              <Input
                value={returnReferenceDocNo}
                onChange={(event) => setReturnReferenceDocNo(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="Optional"
              />
            </Field>
          </div>

          {hasVendorIssue && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Select stock items from one vendor only before creating a return.
            </div>
          )}

          {hasDepartmentIssue && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Select stock items from one department only before creating a return.
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={closeReturnModal}
            disabled={isReturning}
          >
            Close
          </Button>
          <Button
            type="button"
            className="h-9 rounded-xl"
            onClick={handleReturnSelected}
            disabled={
              isReturning ||
              hasVendorIssue ||
              hasDepartmentIssue ||
              !selectedCanReturn ||
              selectedInventoryItems.length === 0
            }
          >
            {isReturning ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Return
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={invoiceModalOpen}
        onClose={closeInvoiceModal}
        title="Create Invoice"
        subtitle={invoiceItem ? itemLabel(invoiceItem) : undefined}
        icon={<FilePlus2 className="h-4 w-4" />}
        maxWidth="xl"
      >
        <ModalBody className="space-y-5">
          {invoiceItem && (
            <>
              <div className="grid gap-3 text-sm sm:grid-cols-3">
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Quantity Available
                  </p>
                  <p className="mt-1 font-semibold">{invoiceItem.quantity}</p>
                </div>
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Unit Price
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatNumber(unitPrice(invoiceItem))}
                  </p>
                </div>
                <div className="rounded-xl border bg-muted/20 px-3 py-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Total Amount
                  </p>
                  <p className="mt-1 font-semibold">
                    {formatNumber(invoiceItem.totalCost)}
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Item Name">
                  <Input
                    value={itemLabel(invoiceItem)}
                    readOnly
                    className="h-10 rounded-xl bg-muted"
                  />
                </Field>
                <Field label="Item Description">
                  <Input
                    value={itemDescription(invoiceItem)}
                    readOnly
                    className="h-10 rounded-xl bg-muted"
                  />
                </Field>
                <Field label="Lot ID">
                  <Input
                    value={String(invoiceItem.lotId)}
                    readOnly
                    className="h-10 rounded-xl bg-muted"
                  />
                </Field>
                <Field label="Source Doc ID">
                  <Input
                    value={String(
                      purchaseDocument(invoiceItem)?.docId ??
                        originDocument(invoiceItem)?.docId ??
                        "-",
                    )}
                    readOnly
                    className="h-10 rounded-xl bg-muted"
                  />
                </Field>
                <Field label="Account Doc ID">
                  <Input
                    value={
                      isInternalInvoice
                        ? selectedInvoiceDestination?.companyCode ?? ""
                        : selectedInvoiceCustomer?.accountIndex ?? ""
                    }
                    readOnly
                    className="h-10 rounded-xl bg-muted"
                  />
                </Field>
                <Field label="Reference Doc No">
                  <Input
                    value={invoiceReferenceDocNo}
                    onChange={(event) =>
                      setInvoiceReferenceDocNo(event.target.value)
                    }
                    className="h-10 rounded-xl"
                    placeholder="REF-2026-001"
                  />
                </Field>
                <Field label="Invoice Type">
                  <Select
                    value={invoiceType}
                    onValueChange={(value) =>
                      handleInvoiceTypeChange(value as InvoiceType)
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue placeholder="Select invoice type" />
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
                >
                  {isInternalInvoice ? (
                    <Select
                      value={invoiceDestinationDepartmentId || undefined}
                      onValueChange={setInvoiceDestinationDepartmentId}
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
                    <Select
                      value={invoiceAccountId || NO_CUSTOMER}
                      onValueChange={(value) =>
                        setInvoiceAccountId(value === NO_CUSTOMER ? "" : value)
                      }
                      disabled={customerAccounts.length === 0}
                    >
                      <SelectTrigger className="h-10 w-full rounded-xl">
                        <SelectValue placeholder="Select customer" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_CUSTOMER}>Select customer</SelectItem>
                        {customerAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {accountLabel(account)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
                <Field label="Doc Date">
                  <Input
                    type="date"
                    value={invoiceDocDate}
                    onChange={(event) => setInvoiceDocDate(event.target.value)}
                    className="h-10 rounded-xl"
                  />
                </Field>
                <Field label="Status">
                  <Select
                    value={invoiceStatus}
                    onValueChange={(value) =>
                      setInvoiceStatus(value as InvoiceStatus)
                    }
                  >
                    <SelectTrigger className="h-10 w-full rounded-xl">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      {invoiceStatusOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Remark">
                  <Input
                    value={invoiceRemark}
                    onChange={(event) => setInvoiceRemark(event.target.value)}
                    className="h-10 rounded-xl"
                    placeholder="Optional"
                  />
                </Field>
              </div>
            </>
          )}
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={closeInvoiceModal}
            disabled={isCreatingInvoice}
          >
            Close
          </Button>
          <Button
            type="button"
            className="h-9 rounded-xl"
            onClick={handleCreateInvoiceFromInventory}
            disabled={isCreatingInvoice || !invoiceItem}
          >
            {isCreatingInvoice ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FilePlus2 className="h-4 w-4" />
            )}
            Save and Close
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={transferModalOpen}
        onClose={closeTransferModal}
        title="Transfer Inventory"
        subtitle={transferItem ? itemLabel(transferItem) : undefined}
        icon={<ArrowRightLeft className="h-4 w-4" />}
        maxWidth="xl"
      >
        <ModalBody className="max-h-[75vh] overflow-y-auto">
          <TransferForm
            companyId={currentCompany?.id ?? null}
            initialItem={transferItem}
            onCancel={closeTransferModal}
            onTransferred={handleTransferCreated}
            submitLabel="Save Transfer"
          />
        </ModalBody>
      </Modal>
    </div>
  );
}
