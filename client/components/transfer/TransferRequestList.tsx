"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  approveTransferRequest,
  getIncomingTransferRequests,
  getOutgoingTransferRequests,
  getTransferRequests,
  rejectTransferRequest,
} from "@/api/services/transfer-request.service";
import type {
  TransferRequestItem,
  TransferRequestStatus,
} from "@/api/services/transfer-request.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";
import { useAppSelector } from "@/store/hooks";

type RequestListMode = "all" | "incoming" | "outgoing";
type DecisionAction = "approve" | "reject";

type TransferRequestListProps = {
  mode: RequestListMode;
  title: string;
  subtitle: string;
};

const statusStyles: Record<TransferRequestStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 ring-amber-200",
  APPROVED: "bg-blue-50 text-blue-700 ring-blue-200",
  REJECTED: "bg-rose-50 text-rose-700 ring-rose-200",
  TRANSFERRED: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  CANCELLED: "bg-slate-50 text-slate-700 ring-slate-200",
};

function formatDate(value?: string | null) {
  if (!value) return "-";
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

function itemLabel(request: TransferRequestItem) {
  const item = request.inventoryItem;
  if (!item) return "-";
  return item.itemMaster
    ? `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`
    : (item.itemType ?? item.itemId);
}

function StatusPill({ status }: { status: TransferRequestStatus }) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${statusStyles[status]}`}
    >
      {status}
    </span>
  );
}

export default function TransferRequestList({
  mode,
  title,
  subtitle,
}: TransferRequestListProps) {
  const user = useAppSelector((state) => state.auth.user);
  const [requests, setRequests] = useState<TransferRequestItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decisionRequest, setDecisionRequest] =
    useState<TransferRequestItem | null>(null);
  const [decisionAction, setDecisionAction] =
    useState<DecisionAction | null>(null);
  const [responseNote, setResponseNote] = useState("");
  const [decisionInvoiceNo, setDecisionInvoiceNo] = useState("");
  const [savingDecision, setSavingDecision] = useState(false);

  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );

  useEffect(() => {
    let cancelled = false;

    const loadRequests = async () => {
      try {
        setLoading(true);
        setError(null);
        const loader =
          mode === "incoming"
            ? getIncomingTransferRequests
            : mode === "outgoing"
              ? getOutgoingTransferRequests
              : getTransferRequests;
        const response = await loader("user");
        if (!cancelled) {
          setRequests(response.data.transferRequests ?? []);
        }
      } catch {
        if (!cancelled) setError("Failed to load transfer requests.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadRequests();

    return () => {
      cancelled = true;
    };
  }, [mode]);

  const canDecideRequest = (request: TransferRequestItem) => {
    const sourceAccess = departmentAccesses.find(
      (access) => access.departmentId === request.sourceDepartment.id,
    );

    return sourceAccess
      ? permissionAllows(
          permissionsToMap(sourceAccess.permissions).NEW_TRANSFER,
          "READ_WRITE",
        )
      : false;
  };

  const filteredRequests = useMemo(() => {
    const value = search.trim();
    if (!value) return requests;

    return requests.filter((request) =>
      matchesTableSearch(
        [
          request.requestNo,
          request.status,
          request.sourceCompany.name,
          request.sourceDepartment.name,
          request.requesterCompany.name,
          request.requesterDepartment.name,
          request.requesterUser.fullName,
          request.inventoryItem?.lotId,
          request.inventoryItem?.lotName,
          request.inventoryItem?.certificateNo,
          request.inventoryItem?.itemId,
          request.inventoryItem?.itemMaster?.itemName,
          request.transfer?.transferNo,
          request.requestNote,
          request.responseNote,
        ],
        value,
      ),
    );
  }, [requests, search]);

  const { paginatedItems, ...pagination } = usePagination(filteredRequests);

  const openDecisionModal = (
    request: TransferRequestItem,
    action: DecisionAction,
  ) => {
    setDecisionRequest(request);
    setDecisionAction(action);
    setResponseNote("");
    setDecisionInvoiceNo("");
  };

  const closeDecisionModal = () => {
    if (savingDecision) return;
    setDecisionRequest(null);
    setDecisionAction(null);
    setResponseNote("");
    setDecisionInvoiceNo("");
  };

  const submitDecision = async () => {
    if (!decisionRequest || !decisionAction) return;
    const invoiceNo = decisionInvoiceNo.trim();

    if (decisionAction === "approve" && !invoiceNo) {
      toast.error("Enter Invoice No before approving.");
      return;
    }

    try {
      setSavingDecision(true);
      const response =
        decisionAction === "approve"
          ? await approveTransferRequest("user", decisionRequest.id, {
              invoiceNo,
              responseNote: responseNote.trim() || undefined,
            })
          : await rejectTransferRequest("user", decisionRequest.id, {
              responseNote: responseNote.trim() || undefined,
            });
      const updated = response.data.transferRequest as TransferRequestItem;
      setRequests((items) =>
        items.map((item) => (item.id === updated.id ? updated : item)),
      );
      toast.success(
        decisionAction === "approve"
          ? `Transferred: ${updated.transfer?.transferNo ?? updated.requestNo}`
          : `Rejected: ${updated.requestNo}`,
      );
      closeDecisionModal();
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ?? "Failed to update request.",
      );
    } finally {
      setSavingDecision(false);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-none space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Transfer
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search transfer requests"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading transfer requests...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredRequests.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No transfer requests found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1880px] text-[13px]">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Request No</th>
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Source Company</th>
                    <th className="px-3 py-3 font-medium">Source Department</th>
                    <th className="px-3 py-3 font-medium">Receiving Company</th>
                    <th className="px-3 py-3 font-medium">Receiving Department</th>
                    <th className="px-3 py-3 font-medium">Requester</th>
                    <th className="px-3 py-3 font-medium">Lot ID</th>
                    <th className="px-3 py-3 font-medium">Item</th>
                    <th className="px-3 py-3 font-medium">Lot Name</th>
                    <th className="px-3 py-3 text-right font-medium">Qty</th>
                    <th className="px-3 py-3 text-right font-medium">Weight</th>
                    <th className="px-3 py-3 font-medium">Certificate No</th>
                    <th className="px-3 py-3 text-right font-medium">Cost</th>
                    <th className="px-3 py-3 font-medium">Transfer No</th>
                    <th className="px-3 py-3 font-medium">Requested At</th>
                    <th className="px-3 py-3 font-medium">Note</th>
                    <th className="px-3 py-3 font-medium">Response</th>
                    <th className="px-3 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((request) => {
                    const canDecide =
                      request.status === "PENDING" && canDecideRequest(request);

                    return (
                      <tr
                        key={request.id}
                        className="border-b last:border-0 hover:bg-muted/20"
                      >
                        <td className="px-3 py-3 font-medium text-blue-600">
                          {request.requestNo}
                        </td>
                        <td className="px-3 py-3">
                          <StatusPill status={request.status} />
                        </td>
                        <td className="px-3 py-3">{request.sourceCompany.name}</td>
                        <td className="px-3 py-3">
                          {request.sourceDepartment.name}
                        </td>
                        <td className="px-3 py-3">
                          {request.requesterCompany.name}
                        </td>
                        <td className="px-3 py-3">
                          {request.requesterDepartment.name}
                        </td>
                        <td className="px-3 py-3">
                          {request.requesterUser.fullName}
                        </td>
                        <td className="px-3 py-3 font-medium text-blue-600">
                          {request.inventoryItem?.lotId ?? "-"}
                        </td>
                        <td className="px-3 py-3">{itemLabel(request)}</td>
                        <td className="px-3 py-3">
                          {request.inventoryItem?.lotName ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {request.inventoryItem?.quantity ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {formatNumber(request.inventoryItem?.weight, 4)}
                        </td>
                        <td className="px-3 py-3">
                          {request.inventoryItem?.certificateNo ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold">
                          {formatNumber(request.inventoryItem?.totalCost)}
                        </td>
                        <td className="px-3 py-3 font-medium text-blue-600">
                          {request.transfer?.transferNo ?? "-"}
                        </td>
                        <td className="px-3 py-3">
                          {formatDate(request.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          {request.requestNote ?? "-"}
                        </td>
                        <td className="px-3 py-3">
                          {request.responseNote ?? "-"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {canDecide ? (
                            <div className="flex justify-end gap-2">
                              <Button
                                className="h-8 rounded-xl"
                                onClick={() =>
                                  openDecisionModal(request, "approve")
                                }
                              >
                                <CheckCircle2 className="h-4 w-4" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                className="h-8 rounded-xl"
                                onClick={() =>
                                  openDecisionModal(request, "reject")
                                }
                              >
                                <XCircle className="h-4 w-4" />
                                Reject
                              </Button>
                            </div>
                          ) : (
                            "-"
                          )}
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
        open={Boolean(decisionRequest && decisionAction)}
        onClose={closeDecisionModal}
        title={
          decisionAction === "approve"
            ? "Approve Item Request"
            : "Reject Item Request"
        }
        subtitle={decisionRequest?.requestNo}
        icon={
          decisionAction === "approve" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <XCircle className="h-4 w-4" />
          )
        }
        maxWidth="lg"
      >
        <ModalBody className="space-y-4">
          {decisionRequest && (
            <div className="rounded-xl border bg-muted/30 p-4 text-sm">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground">Lot</p>
                  <p className="font-semibold">
                    {decisionRequest.inventoryItem?.lotId ?? "-"} -{" "}
                    {decisionRequest.inventoryItem?.lotName ?? "-"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Requested By</p>
                  <p className="font-semibold">
                    {decisionRequest.requesterUser.fullName}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">From</p>
                  <p className="font-semibold">
                    {decisionRequest.sourceCompany.name}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">To</p>
                  <p className="font-semibold">
                    {decisionRequest.requesterCompany.name}
                  </p>
                </div>
              </div>
            </div>
          )}

          {decisionAction === "approve" && (
            <Field label="Invoice No" required>
              <Input
                value={decisionInvoiceNo}
                onChange={(event) => setDecisionInvoiceNo(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="INV-2026-001"
                autoFocus
              />
            </Field>
          )}

          <Field label="Response Note">
            <textarea
              value={responseNote}
              onChange={(event) => setResponseNote(event.target.value)}
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
            onClick={closeDecisionModal}
            disabled={savingDecision}
          >
            Close
          </Button>
          <Button
            type="button"
            className="h-9 rounded-xl"
            onClick={submitDecision}
            disabled={savingDecision}
          >
            {savingDecision ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : decisionAction === "approve" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
            {decisionAction === "approve" ? "Approve & Transfer" : "Reject"}
          </Button>
        </ModalFooter>
      </Modal>
    </div>
  );
}
