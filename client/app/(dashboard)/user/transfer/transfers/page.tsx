"use client";

import { FileMinus, FilePlus, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { getTransfers } from "@/api/services/transfer.service";
import type { TransferListItem } from "@/api/services/transfer.service";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";
import { useAppSelector } from "@/store/hooks";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatNumber(value?: number | null, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function itemName(transfer: TransferListItem) {
  const item = transfer.inventoryItem;
  if (!item) return "-";

  return item.itemMaster
    ? `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`
    : (item.itemType ?? item.itemId);
}

export default function TransferListPage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) =>
      state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const [transfers, setTransfers] = useState<TransferListItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const selectedAccess =
    departmentAccesses.find(
      (access) => access.companyId === selectedCompanyId,
    ) ?? departmentAccesses[0];
  const currentCompany = useMemo(() => {
    if (!selectedCompanyId && selectedAccess) {
      return {
        id: selectedAccess.companyId,
        name: selectedAccess.companyName,
        code: selectedAccess.companyCode,
      };
    }

    return (
      accessibleCompanies.find((company) => company.id === selectedCompanyId) ??
      (selectedAccess
        ? {
            id: selectedAccess.companyId,
            name: selectedAccess.companyName,
            code: selectedAccess.companyCode,
          }
        : null)
    );
  }, [accessibleCompanies, selectedAccess, selectedCompanyId]);

  const canReadTransfers = useMemo(
    () =>
      departmentAccesses
        .filter((access) => access.companyId === currentCompany?.id)
        .some((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).TRANSFER_LIST,
            "READ_ONLY",
          ),
        ),
    [currentCompany?.id, departmentAccesses],
  );
  const canCreateTransfer = useMemo(
    () =>
      departmentAccesses
        .filter((access) => access.companyId === currentCompany?.id)
        .some((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).NEW_TRANSFER,
            "READ_WRITE",
          ),
        ),
    [currentCompany?.id, departmentAccesses],
  );
  const canCreateTransferReturn = useMemo(
    () =>
      departmentAccesses
        .filter((access) => access.companyId === currentCompany?.id)
        .some((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).NEW_TRANSFER_RETURN,
            "READ_WRITE",
          ),
        ),
    [currentCompany?.id, departmentAccesses],
  );

  useEffect(() => {
    if (!canReadTransfers || !currentCompany?.id) {
      setLoading(false);
      return;
    }

    const loadTransfers = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getTransfers("user", {
          companyId: currentCompany.id,
        });
        setTransfers(response.data.transfers ?? []);
      } catch {
        setError("Failed to load transfers.");
      } finally {
        setLoading(false);
      }
    };

    loadTransfers();
  }, [canReadTransfers, currentCompany?.id]);

  const filteredTransfers = useMemo(() => {
    const value = search.trim();
    if (!value) return transfers;

    return transfers.filter((transfer) =>
      matchesTableSearch(
        [
          transfer.transferNo,
          transfer.docType,
          transfer.docId,
          transfer.referenceDocNo,
          transfer.notes,
          transfer.company.name,
          transfer.company.code,
          transfer.fromDepartment.company?.name,
          transfer.fromDepartment.company?.code,
          transfer.toDepartment.company?.name,
          transfer.toDepartment.company?.code,
          transfer.fromDepartment.name,
          transfer.toDepartment.name,
          transfer.toUser?.fullName,
          transfer.toUser?.email,
          transfer.createdBy?.fullName,
          transfer.inventoryItem?.lotId,
          transfer.inventoryItem?.lotName,
          transfer.inventoryItem?.itemId,
          transfer.inventoryItem?.itemMaster?.itemName,
          transfer.inventoryItem?.certificateNo,
        ],
        value,
      ),
    );
  }, [search, transfers]);
  const { paginatedItems: paginatedTransfers, ...transferPagination } =
    usePagination(filteredTransfers);

  if (!canReadTransfers) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view transfers in this company.
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
              Transfer
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Transfer List
            </h1>
            <p className="text-sm text-muted-foreground">
              {filteredTransfers.length} transfer records found
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {canCreateTransferReturn && (
              <Button
                variant="outline"
                className="h-9 rounded-xl"
                onClick={() =>
                  router.push("/user/transfer/new-transfer-return")
                }
              >
                <FileMinus className="h-4 w-4" />
                New Transfer Return
              </Button>
            )}

            {canCreateTransfer && (
              <Button
                className="h-9 rounded-xl"
                onClick={() => router.push("/user/transfer/new-transfer")}
              >
                <FilePlus className="h-4 w-4" />
                New Transfer
              </Button>
            )}
          </div>
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search transfers"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading transfers...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredTransfers.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No transfers found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[2160px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Type</th>
                    <th className="px-3 py-3 font-medium">Transfer No</th>
                    <th className="px-3 py-3 font-medium">Doc ID</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Item</th>
                    <th className="px-3 py-3 font-medium">From Company</th>
                    <th className="px-3 py-3 font-medium">From Department</th>
                    <th className="px-3 py-3 font-medium">To Company</th>
                    <th className="px-3 py-3 font-medium">To Department</th>
                    <th className="px-3 py-3 font-medium">To Employee</th>
                    <th className="px-3 py-3 font-medium">Returned By</th>
                    <th className="px-3 py-3 font-medium">Returned To</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 font-medium">Reference Doc No</th>
                    <th className="px-3 py-3 font-medium">Date</th>
                    <th className="px-3 py-3 font-medium">Created By</th>
                    <th className="px-3 py-3 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedTransfers.map((transfer) => (
                    <tr key={transfer.id} className="border-b last:border-0">
                      <td className="px-3 py-3">{transfer.docType}</td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {transfer.transferNo}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {transfer.docId}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {transfer.inventoryItem?.lotId ?? "-"}
                      </td>
                      <td className="px-3 py-3">{itemName(transfer)}</td>
                      <td className="px-3 py-3">
                        {transfer.fromDepartment.company?.name ??
                          transfer.company.name}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.fromDepartment.name}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.toDepartment.company?.name ??
                          transfer.company.name}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.toDepartment.name}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.toUser?.fullName ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.docType === "Transfer Return"
                          ? (transfer.createdBy?.fullName ?? "-")
                          : "-"}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.docType === "Transfer Return"
                          ? (transfer.toUser?.fullName ??
                            transfer.toDepartment.name)
                          : "-"}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {transfer.inventoryItem?.quantity ?? "-"}
                      </td>
                      <td className="px-3 py-3 text-right font-semibold">
                        {formatNumber(transfer.inventoryItem?.weight, 4)}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.inventoryItem?.certificateNo ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.referenceDocNo ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(transfer.docDate)}
                      </td>
                      <td className="px-3 py-3">
                        {transfer.createdBy?.fullName ?? "-"}
                      </td>
                      <td className="px-3 py-3">{transfer.notes ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={transferPagination.page}
              totalPages={transferPagination.totalPages}
              start={transferPagination.start}
              end={transferPagination.end}
              total={transferPagination.total}
              onPageChange={transferPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
