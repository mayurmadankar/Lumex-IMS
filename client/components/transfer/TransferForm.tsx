"use client";

import { ArrowRightLeft, Loader2 } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { getInventoryItemByLot } from "@/api/services/inventory.service";
import type { InventoryItemListItem } from "@/api/services/inventory.service";
import {
  createTransfer,
  getTransferDepartmentUsers,
  getTransferDepartments,
} from "@/api/services/transfer.service";
import type {
  TransferDepartment,
  TransferDepartmentUser,
  TransferListItem,
} from "@/api/services/transfer.service";
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
import { useFormDraft } from "@/hooks/use-form-draft";
import { useAppSelector } from "@/store/hooks";

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

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

  return item.itemType ?? item.itemId;
}

function departmentLabel(department?: InventoryItemListItem["department"] | null) {
  return department?.name ?? "-";
}

type TransferFormProps = {
  companyId: string | null;
  initialItem?: InventoryItemListItem | null;
  onCancel?: () => void;
  onTransferred?: (transfer: TransferListItem) => void;
  submitLabel?: string;
};

type TransferMode = "DEPARTMENT" | "COMPANY";

type TransferDraft = {
  transferMode: TransferMode;
  lotId: string;
  destinationCompanyId: string;
  toDepartmentId: string;
  toUserId: string;
  docDate: string;
  referenceDocNo: string;
  notes: string;
};

function defaultTransferDraft(): TransferDraft {
  return {
    transferMode: "DEPARTMENT",
    lotId: "",
    destinationCompanyId: "",
    toDepartmentId: "",
    toUserId: "",
    docDate: todayInputValue(),
    referenceDocNo: "",
    notes: "",
  };
}

export default function TransferForm({
  companyId,
  initialItem,
  onCancel,
  onTransferred,
  submitLabel = "Save Transfer",
}: TransferFormProps) {
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const [transferMode, setTransferMode] =
    useState<TransferMode>("DEPARTMENT");
  const [lotId, setLotId] = useState(initialItem ? String(initialItem.lotId) : "");
  const [inventoryItem, setInventoryItem] =
    useState<InventoryItemListItem | null>(initialItem ?? null);
  const [isLoadingItem, setIsLoadingItem] = useState(false);
  const [itemError, setItemError] = useState<string | null>(null);
  const [departments, setDepartments] = useState<TransferDepartment[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [destinationCompanyId, setDestinationCompanyId] = useState("");
  const [toDepartmentId, setToDepartmentId] = useState("");
  const [users, setUsers] = useState<TransferDepartmentUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [toUserId, setToUserId] = useState("");
  const [docDate, setDocDate] = useState(todayInputValue());
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const draftKey = !initialItem && companyId ? `ims:draft:new-transfer:${companyId}` : null;
  const sourceCompany = accessibleCompanies.find(
    (company) => company.id === companyId,
  );
  const destinationCompanyOptions = accessibleCompanies.filter(
    (company) => company.id !== companyId && company.status !== "INACTIVE",
  );
  const departmentCompanyId =
    transferMode === "COMPANY" ? destinationCompanyId : companyId;
  const draftValues = useMemo<TransferDraft>(
    () => ({
      transferMode,
      lotId,
      destinationCompanyId,
      toDepartmentId,
      toUserId,
      docDate,
      referenceDocNo,
      notes,
    }),
    [
      destinationCompanyId,
      docDate,
      lotId,
      notes,
      referenceDocNo,
      toDepartmentId,
      toUserId,
      transferMode,
    ],
  );
  const draftMetadata = useMemo(
    () => ({
      title: "New Transfer",
      subtitle: lotId ? `Lot ${lotId}` : "Transfer draft",
      href: "/user/transfer/new-transfer",
    }),
    [lotId],
  );

  useFormDraft<TransferDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultTransferDraft,
    restore: (draft) => {
      setTransferMode(draft.transferMode ?? "DEPARTMENT");
      setLotId(draft.lotId ?? "");
      setDestinationCompanyId(draft.destinationCompanyId ?? "");
      setToDepartmentId(draft.toDepartmentId ?? "");
      setToUserId(draft.toUserId ?? "");
      setDocDate(draft.docDate ?? todayInputValue());
      setReferenceDocNo(draft.referenceDocNo ?? "");
      setNotes(draft.notes ?? "");
      setInventoryItem(null);
      setItemError(null);
    },
  });

  useEffect(() => {
    if (!initialItem) return;
    setInventoryItem(initialItem);
    setLotId(String(initialItem.lotId));
  }, [initialItem]);

  useEffect(() => {
    if (!departmentCompanyId) {
      setDepartments([]);
      return;
    }

    const loadDepartments = async () => {
      try {
        setDepartmentsLoading(true);
        const response = await getTransferDepartments("user", {
          companyId: departmentCompanyId,
        });
        setDepartments(response.data.departments ?? []);
      } catch (error: unknown) {
        const apiError = error as { response?: { data?: { message?: string } } };
        toast.error(
          apiError.response?.data?.message ??
            "Failed to load transfer departments.",
        );
        setDepartments([]);
      } finally {
        setDepartmentsLoading(false);
      }
    };

    loadDepartments();
  }, [departmentCompanyId]);

  useEffect(() => {
    setToDepartmentId("");
    setToUserId("");
  }, [destinationCompanyId, transferMode]);

  useEffect(() => {
    setDestinationCompanyId("");
    setToDepartmentId("");
    setToUserId("");
  }, [companyId]);

  useEffect(() => {
    if (!toDepartmentId) {
      setUsers([]);
      setToUserId("");
      return;
    }

    const loadUsers = async () => {
      try {
        setUsersLoading(true);
        const response = await getTransferDepartmentUsers("user", toDepartmentId);
        setUsers(response.data.users ?? []);
      } catch (error: unknown) {
        const apiError = error as { response?: { data?: { message?: string } } };
        toast.error(
          apiError.response?.data?.message ??
            "Failed to load department employees.",
        );
        setUsers([]);
      } finally {
        setUsersLoading(false);
      }
    };

    loadUsers();
  }, [toDepartmentId]);

  useEffect(() => {
    if (inventoryItem?.department?.id === toDepartmentId) {
      setToDepartmentId("");
      setToUserId("");
    }
  }, [inventoryItem?.department?.id, toDepartmentId]);

  const destinationDepartments = useMemo(
    () =>
      departments.filter(
        (department) =>
          transferMode === "COMPANY" ||
          department.id !== inventoryItem?.department?.id,
      ),
    [departments, inventoryItem?.department?.id, transferMode],
  );

  const selectedDepartment = destinationDepartments.find(
    (department) => department.id === toDepartmentId,
  );
  const selectedUser = users.find((user) => user.id === toUserId);

  const fetchInventoryItem = async (lotNumber: number) => {
    if (!companyId) {
      toast.error("Select a company before fetching a lot.");
      return;
    }

    try {
      setIsLoadingItem(true);
      setItemError(null);
      const response = await getInventoryItemByLot("user", lotNumber, {
        companyId,
      });
      setInventoryItem(response.data.inventoryItem ?? null);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      setInventoryItem(null);
      setItemError(
        apiError.response?.data?.message ??
          "No available inventory item found for this Lot ID.",
      );
    } finally {
      setIsLoadingItem(false);
    }
  };

  useEffect(() => {
    const trimmedLotId = lotId.trim();

    if (!trimmedLotId) {
      if (!initialItem) setInventoryItem(null);
      setItemError(null);
      return;
    }

    const lotNumber = Number(trimmedLotId);

    if (!Number.isInteger(lotNumber) || lotNumber <= 0) {
      setInventoryItem(null);
      setItemError("Enter a valid Lot ID.");
      return;
    }

    if (inventoryItem?.lotId === lotNumber) {
      setItemError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      fetchInventoryItem(lotNumber);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [companyId, initialItem, inventoryItem?.lotId, lotId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!companyId) {
      toast.error("Select a company before creating a transfer.");
      return;
    }

    if (!inventoryItem) {
      toast.error("Fetch an available inventory item first.");
      return;
    }

    if (transferMode === "COMPANY" && !destinationCompanyId) {
      toast.error("Select a destination company.");
      return;
    }

    if (!selectedDepartment) {
      toast.error("Select a destination department.");
      return;
    }

    if (!selectedUser) {
      toast.error("Select an employee for the destination department.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await createTransfer("user", {
        transferMode,
        companyId,
        destinationCompanyId:
          transferMode === "COMPANY" ? destinationCompanyId : undefined,
        inventoryItemId: inventoryItem.id,
        toDepartmentId: selectedDepartment.id,
        toUserId: selectedUser.id,
        docDate,
        referenceDocNo: referenceDocNo.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      toast.success(`Transfer created: ${response.data.transfer.transferNo}`);
      onTransferred?.(response.data.transfer);
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(
        apiError.response?.data?.message ?? "Failed to create transfer.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDepartmentChange = (value: string) => {
    setToDepartmentId(value);
    setToUserId("");
  };

  const handleTransferModeChange = (value: string) => {
    setTransferMode(value as TransferMode);
    setDestinationCompanyId("");
    setToDepartmentId("");
    setToUserId("");
  };

  const handleDestinationCompanyChange = (value: string) => {
    setDestinationCompanyId(value);
    setToDepartmentId("");
    setToUserId("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Transfer Type" required>
          <Select value={transferMode} onValueChange={handleTransferModeChange}>
            <SelectTrigger className="h-10 w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DEPARTMENT">Department Transfer</SelectItem>
              <SelectItem value="COMPANY">Company Transfer</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Source Company">
          <Input
            value={
              sourceCompany
                ? `${sourceCompany.name}${sourceCompany.code ? ` (${sourceCompany.code})` : ""}`
                : "Selected company"
            }
            readOnly
            className="h-10 rounded-xl bg-muted"
          />
        </Field>

        <Field label="Lot ID" required error={itemError ?? undefined}>
          <div className="relative">
            <Input
              value={lotId}
              onChange={(event) => setLotId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();

                const lotNumber = Number(lotId.trim());
                if (!Number.isInteger(lotNumber) || lotNumber <= 0) {
                  setInventoryItem(null);
                  setItemError("Enter a valid Lot ID.");
                  return;
                }

                fetchInventoryItem(lotNumber);
              }}
              className="h-10 rounded-xl pr-10"
              placeholder="Enter lot id"
              inputMode="numeric"
            />
            {isLoadingItem && (
              <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
            )}
          </div>
        </Field>
      </div>

      {inventoryItem && (
        <>
          <div className="grid gap-3 text-sm sm:grid-cols-3">
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Current Dept
              </p>
              <p className="mt-1 font-semibold">
                {departmentLabel(inventoryItem.department)}
              </p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Lot
              </p>
              <p className="mt-1 font-semibold">{inventoryItem.lotId}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                Weight
              </p>
              <p className="mt-1 font-semibold">
                {formatNumber(inventoryItem.weight, 4)}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Item">
              <Input
                value={itemLabel(inventoryItem)}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Lot Name">
              <Input
                value={inventoryItem.lotName}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Quantity">
              <Input
                value={String(inventoryItem.quantity)}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Total Cost">
              <Input
                value={formatNumber(inventoryItem.totalCost)}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Lab">
              <Input
                value={inventoryItem.labAccountName || "-"}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Certificate No">
              <Input
                value={inventoryItem.certificateNo || "-"}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Shape / Color / Clarity">
              <Input
                value={[
                  inventoryItem.shape,
                  inventoryItem.color,
                  inventoryItem.clarity,
                ]
                  .filter(Boolean)
                  .join(" / ") || "-"}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
            <Field label="Location">
              <Input
                value={inventoryItem.locationAccountName}
                readOnly
                className="h-10 rounded-xl bg-muted"
              />
            </Field>
          </div>
        </>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {transferMode === "COMPANY" && (
          <Field label="Transfer To Company" required>
            <Select
              value={destinationCompanyId || undefined}
              onValueChange={handleDestinationCompanyChange}
              disabled={destinationCompanyOptions.length === 0}
            >
              <SelectTrigger className="h-10 w-full rounded-xl">
                <SelectValue placeholder="Select company" />
              </SelectTrigger>
              <SelectContent>
                {destinationCompanyOptions.map((company) => (
                  <SelectItem key={company.id} value={company.id}>
                    {company.name}
                    {company.code ? ` (${company.code})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {destinationCompanyOptions.length === 0 ? (
              <p className="mt-1 text-xs text-muted-foreground">
                No other accessible companies available.
              </p>
            ) : null}
          </Field>
        )}

        <Field label="Transfer To Department" required>
          <Select
            value={toDepartmentId || undefined}
            onValueChange={handleDepartmentChange}
            disabled={
              !inventoryItem ||
              (transferMode === "COMPANY" && !destinationCompanyId) ||
              departmentsLoading ||
              destinationDepartments.length === 0
            }
          >
            <SelectTrigger className="h-10 w-full rounded-xl">
              <SelectValue
                placeholder={
                  departmentsLoading ? "Loading departments" : "Select department"
                }
              />
            </SelectTrigger>
            <SelectContent>
              {destinationDepartments.map((department) => (
                <SelectItem key={department.id} value={department.id}>
                  {department.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Transfer To Employee" required>
          <Select
            value={toUserId || undefined}
            onValueChange={setToUserId}
            disabled={!toDepartmentId || usersLoading || users.length === 0}
          >
            <SelectTrigger className="h-10 w-full rounded-xl">
              <SelectValue
                placeholder={usersLoading ? "Loading employees" : "Select employee"}
              />
            </SelectTrigger>
            <SelectContent>
              {users.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {user.fullName} ({user.email})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Doc Date">
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

        <Field label="Notes">
          <Input
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="h-10 rounded-xl"
            placeholder="Optional"
          />
        </Field>
      </div>

      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Close
          </Button>
        )}
        <Button
          type="submit"
          className="h-9 rounded-xl"
          disabled={isSubmitting || !inventoryItem}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ArrowRightLeft className="h-4 w-4" />
          )}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
