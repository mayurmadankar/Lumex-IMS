"use client";

import { Loader2, RotateCcw, Search, ShoppingCart } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getMemoInventoryItems,
  purchaseMemoInventoryItems,
  returnMemoInventoryItems,
} from "@/api/services/memo.service";
import type { MemoInventoryItem } from "@/api/services/memo.service";
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

const NO_PAYMENT_TERM = "__NONE__";

const paymentTermOptions = Array.from({ length: 15 }, (_, index) => {
  const value = String(index + 1);
  return {
    value,
    label: `${value} ${value === "1" ? "Day" : "Days"}`,
  };
});

function formatNumber(value: number, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function itemLabel(item: MemoInventoryItem) {
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? "-";
}

function StatusText({ status }: { status: MemoInventoryItem["status"] }) {
  const styles: Record<MemoInventoryItem["status"], string> = {
    STOCK: "text-emerald-600",
    MEMO: "text-rose-600",
    SOLD: "text-blue-600",
    RETURNED: "text-slate-600",
  };

  return <span className={`font-semibold ${styles[status]}`}>{status}</span>;
}

type MemoInventoryDocument =
  | NonNullable<MemoInventoryItem["originDocument"]>
  | NonNullable<MemoInventoryItem["purchase"]>
  | NonNullable<MemoInventoryItem["purchaseReturn"]>
  | NonNullable<MemoInventoryItem["memo"]>
  | NonNullable<MemoInventoryItem["memoReturn"]>;

function originDocument(item: MemoInventoryItem) {
  return item.originDocument ?? item.originMemo ?? item.memo ?? item.purchase ?? null;
}

function purchaseDocument(item: MemoInventoryItem) {
  return item.purchase ?? item.purchaseNote ?? null;
}

function returnDocument(item: MemoInventoryItem) {
  return item.purchaseReturn ?? item.memoReturn ?? null;
}

function currentDocument(item: MemoInventoryItem) {
  return originDocument(item);
}

function documentNo(document?: MemoInventoryDocument | null) {
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

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function companyLabel(company?: MemoInventoryItem["company"]) {
  if (!company) return "-";
  return company.code ? `${company.name} (${company.code})` : company.name;
}

export default function MemoListPage() {
  const user = useAppSelector((state) => state.auth.user);
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const [memoItems, setMemoItems] = useState<MemoInventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [purchasePaymentTerm, setPurchasePaymentTerm] = useState("");
  const [purchaseDocDate, setPurchaseDocDate] = useState(todayInputValue());
  const [purchaseRemark, setPurchaseRemark] = useState("");
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [returnModalOpen, setReturnModalOpen] = useState(false);
  const [returnDocDate, setReturnDocDate] = useState(todayInputValue());
  const [returnReferenceDocNo, setReturnReferenceDocNo] = useState("");
  const [isReturning, setIsReturning] = useState(false);

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
  const permissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : persistedPermissions;
  const canReadMemos = permissionAllows(
    permissionMap.MEMO_IN_INVENTORY,
    "READ_ONLY",
  );
  const canPurchaseMemoItems = permissionAllows(
    permissionMap.NEW_PURCHASE_NOTE,
    "READ_WRITE",
  );
  const canReturnMemoItems = permissionAllows(
    permissionMap.MEMO_IN_RETURN,
    "READ_WRITE",
  );

  useEffect(() => {
    if (!canReadMemos || !selectedDepartmentId) {
      setLoading(false);
      return;
    }

    const loadMemoItems = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getMemoInventoryItems("user", {
          departmentId: selectedDepartmentId,
        });
        setMemoItems(response.data.inventoryItems ?? []);
      } catch {
        setError("Failed to load memo stock.");
      } finally {
        setLoading(false);
      }
    };

    loadMemoItems();
  }, [canReadMemos, selectedDepartmentId]);

  useEffect(() => {
    const availableIds = new Set(memoItems.map((item) => item.id));
    setSelectedItemIds((ids) => ids.filter((id) => availableIds.has(id)));
  }, [memoItems]);

  const filteredMemoItems = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return memoItems;

    return memoItems.filter((item) =>
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
        item.company?.name,
        item.company?.code,
        item.status,
        item.remark,
        item.vendorAccount?.accountName,
        currentDocument(item)?.status,
        currentDocument(item)?.paymentTerm,
        currentDocument(item)?.currency,
      ]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(value)),
    );
  }, [memoItems, search]);
  const {
    paginatedItems: paginatedMemoItems,
    ...memoInventoryPagination
  } = usePagination(filteredMemoItems);

  const selectedMemoItems = useMemo(
    () => memoItems.filter((item) => selectedItemIds.includes(item.id)),
    [memoItems, selectedItemIds],
  );
  const {
    paginatedItems: paginatedSelectedMemoItems,
    ...selectedMemoPagination
  } = usePagination(selectedMemoItems);
  const selectedTotals = useMemo(
    () =>
      selectedMemoItems.reduce(
        (total, item) => ({
          quantity: total.quantity + item.quantity,
          weight: total.weight + item.weight,
          cost: total.cost + item.totalCost,
        }),
        { quantity: 0, weight: 0, cost: 0 },
      ),
    [selectedMemoItems],
  );
  const selectedVendorIds = useMemo(
    () =>
      new Set(
        selectedMemoItems.map((item) => item.vendorAccount?.id ?? "__MISSING__"),
      ),
    [selectedMemoItems],
  );
  const selectedVendorNames = useMemo(
    () =>
      [...new Set(selectedMemoItems.map((item) => item.vendorAccount?.accountName ?? "-"))],
    [selectedMemoItems],
  );
  const selectedCompanyNames = useMemo(
    () => [...new Set(selectedMemoItems.map((item) => companyLabel(item.company)))],
    [selectedMemoItems],
  );
  const hasVendorIssue =
    selectedMemoItems.length > 0 &&
    (selectedVendorIds.size !== 1 || selectedVendorIds.has("__MISSING__"));
  const allFilteredSelected =
    paginatedMemoItems.length > 0 &&
    paginatedMemoItems.every((item) => selectedItemIds.includes(item.id));

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
    const visibleIds = paginatedMemoItems.map((item) => item.id);
    setSelectedItemIds((ids) => {
      if (!checked) return ids.filter((id) => !visibleIds.includes(id));
      return [...new Set([...ids, ...visibleIds])];
    });
  };

  const openPurchaseModal = () => {
    if (selectedMemoItems.length === 0) {
      toast.error("Select at least one memo item.");
      return;
    }

    setPurchaseModalOpen(true);
  };

  const closePurchaseModal = () => {
    if (isPurchasing) return;
    setPurchaseModalOpen(false);
  };

  const openReturnModal = () => {
    if (selectedMemoItems.length === 0) {
      toast.error("Select at least one memo item.");
      return;
    }

    setReturnModalOpen(true);
  };

  const closeReturnModal = () => {
    if (isReturning) return;
    setReturnModalOpen(false);
  };

  const handlePurchaseSelected = async () => {
    if (!selectedDepartmentId) {
      toast.error("Select a department before purchasing memo items.");
      return;
    }

    if (selectedMemoItems.length === 0) {
      toast.error("Select at least one memo item.");
      return;
    }

    if (hasVendorIssue) {
      toast.error("Select memo items from one vendor only.");
      return;
    }

    try {
      setIsPurchasing(true);
      const response = await purchaseMemoInventoryItems("user", {
        departmentId: selectedDepartmentId,
        itemIds: selectedItemIds,
        paymentTerm: purchasePaymentTerm ? Number(purchasePaymentTerm) : null,
        currency: "USD",
        docDate: purchaseDocDate,
        status: "ACTIVE",
        remark: purchaseRemark,
      });

      const purchasedIds = new Set(selectedItemIds);
      setMemoItems((items) => items.filter((item) => !purchasedIds.has(item.id)));
      setSelectedItemIds([]);
      setPurchasePaymentTerm("");
      setPurchaseRemark("");
      setPurchaseDocDate(todayInputValue());
      setPurchaseModalOpen(false);
      toast.success(`Purchase created: ${response.data.purchaseNote.purchaseNo}`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ?? "Failed to purchase memo items.",
      );
    } finally {
      setIsPurchasing(false);
    }
  };

  const handleReturnSelected = async () => {
    if (!selectedDepartmentId) {
      toast.error("Select a department before returning memo items.");
      return;
    }

    if (selectedMemoItems.length === 0) {
      toast.error("Select at least one memo item.");
      return;
    }

    if (hasVendorIssue) {
      toast.error("Select memo items from one vendor only.");
      return;
    }

    try {
      setIsReturning(true);
      const response = await returnMemoInventoryItems("user", {
        departmentId: selectedDepartmentId,
        itemIds: selectedItemIds,
        docDate: returnDocDate,
        referenceDocNo: returnReferenceDocNo,
      });

      const returnedIds = new Set(selectedItemIds);
      setMemoItems((items) => items.filter((item) => !returnedIds.has(item.id)));
      setSelectedItemIds([]);
      setReturnReferenceDocNo("");
      setReturnDocDate(todayInputValue());
      setReturnModalOpen(false);
      toast.success(`Memo return created: ${response.data.memo.memoNo}`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ?? "Failed to return memo items.",
      );
    } finally {
      setIsReturning(false);
    }
  };

  if (!canReadMemos) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view memo inventory in this department.
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
              Inventory
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Memo In Inventory
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredMemoItems.length} live memo stock records found
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canPurchaseMemoItems && (
              <Button
                className="h-9 rounded-xl"
                disabled={selectedMemoItems.length === 0}
                onClick={openPurchaseModal}
              >
                <ShoppingCart className="h-4 w-4" />
                Purchase Selected
              </Button>
            )}

            {canReturnMemoItems && (
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                disabled={selectedMemoItems.length === 0}
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
            placeholder="Search memo stock"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading memo stock...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredMemoItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No memo stock found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2220px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    {(canPurchaseMemoItems || canReturnMemoItems) && (
                      <th className="w-12 px-3 py-3 font-medium">
                        <input
                          type="checkbox"
                          aria-label="Select all visible memo items"
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
                  {paginatedMemoItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      {(canPurchaseMemoItems || canReturnMemoItems) && (
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            aria-label={`Select lot ${item.lotId}`}
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(event) =>
                              toggleItemSelection(item.id, event.target.checked)
                            }
                            className="h-4 w-4 rounded border-input"
                          />
                        </td>
                      )}
                      <td className="px-3 py-3">{itemLabel(item)}</td>
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
                      <td className="px-3 py-3">{item.locationAccountName ?? "-"}</td>
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
                        {formatDate(currentDocument(item)?.docDate)}
                      </td>
                      <td className="px-3 py-3">
                        {currentDocument(item)?.status ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {formatPaymentTerm(currentDocument(item)?.paymentTerm)}
                      </td>
                      <td className="px-3 py-3">
                        {currentDocument(item)?.currency ?? "-"}
                      </td>
                      <td className="px-3 py-3">{item.remark ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={memoInventoryPagination.page}
              totalPages={memoInventoryPagination.totalPages}
              start={memoInventoryPagination.start}
              end={memoInventoryPagination.end}
              total={memoInventoryPagination.total}
              onPageChange={memoInventoryPagination.setPage}
            />
          </div>
        )}
      </div>

      <Modal
        open={purchaseModalOpen}
        onClose={closePurchaseModal}
        title="Purchase Memo Items"
        subtitle={`${selectedMemoItems.length} selected`}
        icon={<ShoppingCart className="h-4 w-4" />}
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
                value={purchaseDocDate}
                onChange={(event) => setPurchaseDocDate(event.target.value)}
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Payment Terms">
              <Select
                value={purchasePaymentTerm || NO_PAYMENT_TERM}
                onValueChange={(value) =>
                  setPurchasePaymentTerm(value === NO_PAYMENT_TERM ? "" : value)
                }
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Payment terms" />
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
            <Field label="Currency">
              <Input value="USD" readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Remark">
              <Input
                value={purchaseRemark}
                onChange={(event) => setPurchaseRemark(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="Remark for selected lots"
              />
            </Field>
          </div>

          {hasVendorIssue && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Select memo items from one vendor only before creating a purchase.
            </div>
          )}

          <div className="max-h-52 overflow-auto rounded-xl border">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <th className="px-3 py-2 font-medium">Item ID</th>
                  <th className="px-3 py-2 font-medium">Origin Doc ID</th>
                  <th className="px-3 py-2 font-medium">Lot ID</th>
                  <th className="px-3 py-2 font-medium">Lot Name</th>
                  <th className="px-3 py-2 text-right font-medium">Weight</th>
                  <th className="px-3 py-2 text-right font-medium">Total Cost</th>
                </tr>
              </thead>
              <tbody>
                {paginatedSelectedMemoItems.map((item) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="px-3 py-2">{itemLabel(item)}</td>
                    <td className="px-3 py-2">{originDocument(item)?.docId ?? "-"}</td>
                    <td className="px-3 py-2">{item.lotId}</td>
                    <td className="px-3 py-2">{item.lotName}</td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(item.weight, 4)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatNumber(item.totalCost)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="overflow-hidden rounded-xl border">
            <Pagination
              page={selectedMemoPagination.page}
              totalPages={selectedMemoPagination.totalPages}
              start={selectedMemoPagination.start}
              end={selectedMemoPagination.end}
              total={selectedMemoPagination.total}
              onPageChange={selectedMemoPagination.setPage}
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={closePurchaseModal}
            disabled={isPurchasing}
          >
            Close
          </Button>
          <Button
            type="button"
            className="h-9 rounded-xl"
            onClick={handlePurchaseSelected}
            disabled={isPurchasing || hasVendorIssue || selectedMemoItems.length === 0}
          >
            {isPurchasing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ShoppingCart className="h-4 w-4" />
            )}
            Purchase
          </Button>
        </ModalFooter>
      </Modal>

      <Modal
        open={returnModalOpen}
        onClose={closeReturnModal}
        title="Return Memo Items"
        subtitle={`${selectedMemoItems.length} selected`}
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
              Select memo items from one vendor only before creating a return.
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
            disabled={isReturning || hasVendorIssue || selectedMemoItems.length === 0}
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
    </div>
  );
}
