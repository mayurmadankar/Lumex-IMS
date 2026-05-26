"use client";

import { Loader2, Send } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { InventoryItemListItem } from "@/api/services/inventory.service";
import {
  createTransferRequest,
  getCrossCompanyInventory,
} from "@/api/services/transfer-request.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import Pagination from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";
import { useAppSelector } from "@/store/hooks";

type AvailableStockItem = InventoryItemListItem & {
  pendingTransferRequest?: {
    id: string;
    requestNo: string;
    status: "PENDING";
  } | null;
};

function formatNumber(value?: number | null, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function itemLabel(item: InventoryItemListItem) {
  return item.itemMaster
    ? `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`
    : (item.itemType ?? item.itemId);
}

export default function AvailableCompanyStockPage() {
  const user = useAppSelector((state) => state.auth.user);
  const selectedCompanyId = useAppSelector(
    (state) =>
      state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const [inventoryItems, setInventoryItems] = useState<AvailableStockItem[]>(
    [],
  );
  const [requestedItemIds, setRequestedItemIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestItem, setRequestItem] = useState<InventoryItemListItem | null>(
    null,
  );
  const [receivingCompanyId, setReceivingCompanyId] = useState("");
  const [receivingDepartmentId, setReceivingDepartmentId] = useState("");
  const [requestNote, setRequestNote] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );

  const companyOptions = useMemo(() => {
    const map = new Map<string, { id: string; name: string; code?: string | null }>();

    accessibleCompanies.forEach((company) => {
      map.set(company.id, company);
    });

    departmentAccesses.forEach((access) => {
      map.set(access.companyId, {
        id: access.companyId,
        name: access.companyName,
        code: access.companyCode,
      });
    });

    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [accessibleCompanies, departmentAccesses]);

  const receivingDepartments = useMemo(
    () =>
      departmentAccesses
        .filter((access) => access.companyId === receivingCompanyId)
        .filter((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).INVENTORY_LIST,
            "READ_ONLY",
          ),
        )
        .sort((a, b) => a.departmentName.localeCompare(b.departmentName)),
    [departmentAccesses, receivingCompanyId],
  );
  const hasReceivingDepartmentAccess = useMemo(
    () =>
      departmentAccesses.some((access) =>
        permissionAllows(
          permissionsToMap(access.permissions).INVENTORY_LIST,
          "READ_ONLY",
        ),
      ),
    [departmentAccesses],
  );

  useEffect(() => {
    let cancelled = false;

    const loadInventory = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getCrossCompanyInventory("user");
        if (!cancelled) {
          setInventoryItems(response.data.inventoryItems ?? []);
        }
      } catch {
        if (!cancelled) setError("Failed to load company stock.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadInventory();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const value = search.trim();
    if (!value) return inventoryItems;

    return inventoryItems.filter((item) =>
      matchesTableSearch(
        [
          item.company?.name,
          item.company?.code,
          item.department?.name,
          item.lotId,
          item.lotName,
          item.itemId,
          item.itemMaster?.itemName,
          item.itemMaster?.itemType,
          item.certificateNo,
          item.labAccountName,
          item.vendorAccount?.accountName,
          item.remark,
        ],
        value,
      ),
    );
  }, [inventoryItems, search]);

  const { paginatedItems, ...pagination } = usePagination(filteredItems);

  const openRequestModal = (item: InventoryItemListItem) => {
    const defaultCompanyId =
      companyOptions.find((company) => company.id === selectedCompanyId)?.id ??
      companyOptions[0]?.id ??
      "";
    const defaultDepartmentId =
      departmentAccesses
        .filter((access) => access.companyId === defaultCompanyId)
        .find((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).INVENTORY_LIST,
            "READ_ONLY",
          ),
        )?.departmentId ?? "";

    setRequestItem(item);
    setReceivingCompanyId(defaultCompanyId);
    setReceivingDepartmentId(defaultDepartmentId);
    setRequestNote("");
  };

  const closeRequestModal = () => {
    if (isSubmitting) return;
    setRequestItem(null);
    setReceivingCompanyId("");
    setReceivingDepartmentId("");
    setRequestNote("");
  };

  const handleReceivingCompanyChange = (companyId: string) => {
    setReceivingCompanyId(companyId);
    const nextDepartmentId =
      departmentAccesses
        .filter((access) => access.companyId === companyId)
        .find((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).INVENTORY_LIST,
            "READ_ONLY",
          ),
        )?.departmentId ?? "";
    setReceivingDepartmentId(nextDepartmentId);
  };

  const submitRequest = async () => {
    if (!requestItem) return;
    if (!receivingCompanyId || !receivingDepartmentId) {
      toast.error("Select receiving company and department.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await createTransferRequest("user", {
        inventoryItemId: requestItem.id,
        requesterCompanyId: receivingCompanyId,
        requesterDepartmentId: receivingDepartmentId,
        requestNote: requestNote.trim() || undefined,
      });
      setRequestedItemIds((ids) => [...new Set([...ids, requestItem.id])]);
      toast.success(
        `Request created: ${response.data.transferRequest.requestNo}`,
      );
      closeRequestModal();
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ?? "Failed to create item request.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-none space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Transfer
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">
            Available Company Stock
          </h1>
          <p className="text-sm text-muted-foreground">
            {filteredItems.length} stock lots available from other companies
          </p>
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search available stock"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading available stock...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No stock available from other companies.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1540px] text-[13px]">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Department</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Item</th>
                    <th className="px-3 py-3 font-medium">Lot Name</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 font-medium">Lab</th>
                    <th className="px-3 py-3 text-right font-medium">Cost</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Remark</th>
                    <th className="px-3 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const alreadyRequested =
                      requestedItemIds.includes(item.id) ||
                      Boolean(item.pendingTransferRequest);

                    return (
                      <tr
                        key={item.id}
                        className="border-b last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-3 py-3">{item.company.name}</td>
                        <td className="px-3 py-3">
                          {item.department?.name ?? "-"}
                        </td>
                        <td className="px-3 py-3 font-medium text-blue-600">
                          {item.lotId}
                        </td>
                        <td className="px-3 py-3">{itemLabel(item)}</td>
                        <td className="px-3 py-3">{item.lotName}</td>
                        <td className="px-3 py-3 text-right">
                          {item.quantity}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {formatNumber(item.weight, 4)}
                        </td>
                        <td className="px-3 py-3">
                          {item.certificateNo || "-"}
                        </td>
                        <td className="px-3 py-3">
                          {item.labAccountName || "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {formatNumber(item.totalCost)}
                        </td>
                        <td className="px-3 py-3">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-3 py-3">{item.remark ?? "-"}</td>
                        <td className="px-3 py-3 text-right">
                          <Button
                            className="h-8 rounded-xl"
                            disabled={
                              alreadyRequested ||
                              companyOptions.length === 0 ||
                              !hasReceivingDepartmentAccess
                            }
                            onClick={() => openRequestModal(item)}
                          >
                            <Send className="h-4 w-4" />
                            {alreadyRequested ? "Requested" : "Request Item"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              start={pagination.start}
              end={pagination.end}
              total={pagination.total}
              onPageChange={pagination.setPage}
            />
          </div>
        )}
      </div>

      <Modal
        open={Boolean(requestItem)}
        onClose={closeRequestModal}
        title="Request Item"
        subtitle={requestItem ? `Lot ${requestItem.lotId}` : undefined}
        icon={<Send className="h-4 w-4" />}
        maxWidth="lg"
      >
        <ModalBody className="space-y-4">
          {requestItem && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Source Company</p>
                  <p className="font-semibold">{requestItem.company.name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Lot</p>
                  <p className="font-semibold">
                    {requestItem.lotId} - {requestItem.lotName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Item</p>
                  <p className="font-semibold">{itemLabel(requestItem)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Weight</p>
                  <p className="font-semibold">
                    {formatNumber(requestItem.weight, 4)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Receiving Company" required>
              <Select
                value={receivingCompanyId || undefined}
                onValueChange={handleReceivingCompanyChange}
                disabled={companyOptions.length === 0}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Select company" />
                </SelectTrigger>
                <SelectContent>
                  {companyOptions.map((company) => (
                    <SelectItem key={company.id} value={company.id}>
                      {company.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Receiving Department" required>
              <Select
                value={receivingDepartmentId || undefined}
                onValueChange={setReceivingDepartmentId}
                disabled={receivingDepartments.length === 0}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Select department" />
                </SelectTrigger>
                <SelectContent>
                  {receivingDepartments.map((access) => (
                    <SelectItem
                      key={access.departmentId}
                      value={access.departmentId}
                    >
                      {access.departmentName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>

          <Field label="Request Note">
            <textarea
              value={requestNote}
              onChange={(event) => setRequestNote(event.target.value)}
              rows={3}
              className="min-h-24 w-full rounded-xl border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="Optional"
            />
          </Field>
        </ModalBody>
        <ModalFooter>
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={closeRequestModal}
            disabled={isSubmitting}
          >
            Close
          </Button>
          <Button
            type="button"
            className="h-9 rounded-xl"
            onClick={submitRequest}
            disabled={isSubmitting || !requestItem}
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Send Request
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
