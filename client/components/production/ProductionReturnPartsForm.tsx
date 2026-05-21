"use client";

import { ArrowLeft, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import type { InventoryItemListItem } from "@/api/services/inventory.service";
import {
  getProductionReturnItemByLot,
  returnProductionParts,
} from "@/api/services/production.service";
import type {
  ProductionDocument,
  ProductionReturnItem,
  ReturnProductionPartPayload,
} from "@/api/services/production.service";
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
import { useCompanyAccess } from "@/hooks/use-company-access";
import { useFormDraft } from "@/hooks/use-form-draft";

type PartRow = ReturnProductionPartPayload & {
  rowId: string;
};

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function formatNumber(value?: number | null, digits = 2) {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value ?? 0);
}

function itemLabel(item?: InventoryItemListItem | null) {
  if (!item) return "";
  if (item.itemMaster) {
    return `${item.itemMaster.itemId} - ${item.itemMaster.itemName}`;
  }

  return item.itemType ?? item.itemId;
}

function companyLabel(item?: InventoryItemListItem | null) {
  if (!item?.company) return "";
  return item.company.code
    ? `${item.company.name} (${item.company.code})`
    : item.company.name;
}

function createPartFromItem(item: InventoryItemListItem, index: number): PartRow {
  return {
    rowId: crypto.randomUUID(),
    lotName: index === 1 ? `${item.lotName} Part` : `${item.lotName} Part ${index}`,
    quantity: item.quantity,
    weight: item.weight,
    totalCost: item.totalCost,
    labAccountName: item.labAccountName,
    certificateNo: item.certificateNo,
    parcelOrStone: item.parcelOrStone,
    shape: item.shape ?? undefined,
    color: item.color ?? undefined,
    clarity: item.clarity ?? undefined,
    remark: item.remark ?? undefined,
  };
}

function sourceDocumentLabel(document?: ProductionDocument | null) {
  if (!document) return "";
  return `${document.productionNo} (${document.docType})`;
}

type ProductionReturnPartsDraft = {
  lotId: string;
  docDate: string;
  referenceDocNo: string;
  returnLocationAccountName: string;
  lossWeight: string;
  notes: string;
  parts: PartRow[];
};

function defaultProductionReturnPartsDraft(): ProductionReturnPartsDraft {
  return {
    lotId: "",
    docDate: todayInputValue(),
    referenceDocNo: "",
    returnLocationAccountName: "",
    lossWeight: "0",
    notes: "",
    parts: [],
  };
}

export default function ProductionReturnPartsForm() {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const canReturnParts = hasCompanyPermission("RETURN_PARTS", "READ_WRITE");
  const [lotId, setLotId] = useState("");
  const [candidate, setCandidate] = useState<ProductionReturnItem | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [docDate, setDocDate] = useState(todayInputValue());
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [returnLocationAccountName, setReturnLocationAccountName] = useState("");
  const [lossWeight, setLossWeight] = useState<number | string>(0);
  const [notes, setNotes] = useState("");
  const [parts, setParts] = useState<PartRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const pendingPartsRestoreRef = useRef<{
    lotId: string;
    parts: PartRow[];
    returnLocationAccountName: string;
  } | null>(null);

  const item = candidate?.inventoryItem ?? null;
  const sourceProduction = candidate?.sourceProduction ?? null;
  const draftKey = currentCompany?.id
    ? `ims:draft:production-return-parts:${currentCompany.id}`
    : null;
  const draftValues = useMemo<ProductionReturnPartsDraft>(
    () => ({
      lotId,
      docDate,
      referenceDocNo,
      returnLocationAccountName,
      lossWeight: String(lossWeight),
      notes,
      parts,
    }),
    [
      docDate,
      lossWeight,
      lotId,
      notes,
      parts,
      referenceDocNo,
      returnLocationAccountName,
    ],
  );
  const draftMetadata = useMemo(
    () => ({
      title: "Return Parts",
      subtitle: lotId ? `Lot ${lotId}` : currentCompany?.name ?? "Production draft",
      href: "/user/production/return-parts",
    }),
    [currentCompany?.name, lotId],
  );

  const totals = useMemo(
    () =>
      parts.reduce(
        (sum, part) => ({
          quantity: sum.quantity + Number(part.quantity || 0),
          weight: sum.weight + Number(part.weight || 0),
          totalCost: sum.totalCost + Number(part.totalCost || 0),
        }),
        { quantity: 0, weight: 0, totalCost: 0 },
      ),
    [parts],
  );

  const totalWithLoss = totals.weight + Number(lossWeight || 0);
  const overweight = Boolean(item && totalWithLoss > item.weight + 0.0001);

  useFormDraft<ProductionReturnPartsDraft>({
    storageKey: draftKey,
    values: draftValues,
    metadata: draftMetadata,
    getDefaultValues: defaultProductionReturnPartsDraft,
    restore: (draft) => {
      const restoredParts = Array.isArray(draft.parts)
        ? draft.parts.map((part) => ({
            ...part,
            rowId: part.rowId || crypto.randomUUID(),
          }))
        : [];
      const restoredLotId = draft.lotId ?? "";

      pendingPartsRestoreRef.current = restoredLotId
        ? {
            lotId: restoredLotId,
            parts: restoredParts,
            returnLocationAccountName: draft.returnLocationAccountName ?? "",
          }
        : null;
      setLotId(restoredLotId);
      setDocDate(draft.docDate ?? todayInputValue());
      setReferenceDocNo(draft.referenceDocNo ?? "");
      setReturnLocationAccountName(draft.returnLocationAccountName ?? "");
      setLossWeight(draft.lossWeight ?? "0");
      setNotes(draft.notes ?? "");
      setParts(restoredParts);
      setCandidate(null);
      setLookupError(null);
    },
  });

  useEffect(() => {
    const value = lotId.trim();
    const pendingRestore = pendingPartsRestoreRef.current;
    const preservingRestore = Boolean(
      pendingRestore && pendingRestore.lotId === value,
    );

    if (pendingRestore && pendingRestore.lotId !== value) {
      pendingPartsRestoreRef.current = null;
    }

    setCandidate(null);
    setLookupError(null);

    if (!preservingRestore) {
      setParts([]);
      setReturnLocationAccountName("");
    }

    if (!value) return;

    const parsedLotId = Number(value);
    if (!currentCompany?.id || !Number.isInteger(parsedLotId) || parsedLotId <= 0) {
      setLookupError("Enter a valid Lot ID.");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLookupLoading(true);
        const response = await getProductionReturnItemByLot("user", parsedLotId, {
          companyId: currentCompany.id,
        });
        const loaded = response.data.productionReturnItem as ProductionReturnItem;
        const pending = pendingPartsRestoreRef.current;

        setCandidate(loaded);
        if (pending && pending.lotId === value) {
          setReturnLocationAccountName(
            pending.returnLocationAccountName ||
              loaded.inventoryItem.department?.name ||
              "",
          );
          setParts(
            pending.parts.length > 0
              ? pending.parts
              : [createPartFromItem(loaded.inventoryItem, 1)],
          );
          pendingPartsRestoreRef.current = null;
        } else {
          setReturnLocationAccountName(
            loaded.inventoryItem.department?.name ?? "",
          );
          setParts([createPartFromItem(loaded.inventoryItem, 1)]);
        }
      } catch (error: unknown) {
        const apiError = error as { response?: { data?: { message?: string } } };
        setLookupError(
          apiError.response?.data?.message ??
            "No in-process item found for this Lot ID.",
        );
      } finally {
        setLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentCompany?.id, lotId]);

  const updatePart = (
    rowId: string,
    field: keyof ReturnProductionPartPayload,
    value: string,
  ) => {
    setParts((rows) =>
      rows.map((row) => (row.rowId === rowId ? { ...row, [field]: value } : row)),
    );
  };

  const addPart = () => {
    if (!item) return;
    setParts((rows) => [...rows, createPartFromItem(item, rows.length + 1)]);
  };

  const removePart = (rowId: string) => {
    setParts((rows) => rows.filter((row) => row.rowId !== rowId));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentCompany?.id || !item || !sourceProduction) {
      toast.error("Enter a valid in-process Lot ID first.");
      return;
    }

    if (!returnLocationAccountName.trim()) {
      toast.error("Return location is required.");
      return;
    }

    if (parts.length === 0) {
      toast.error("Add at least one returned part.");
      return;
    }

    if (overweight) {
      toast.error("Returned weight plus loss cannot exceed process weight.");
      return;
    }

    try {
      setIsSubmitting(true);
      const response = await returnProductionParts("user", {
        companyId: currentCompany.id,
        inventoryItemId: item.id,
        sourceProductionId: sourceProduction.id,
        returnLocationAccountName: returnLocationAccountName.trim(),
        docDate,
        referenceDocNo: referenceDocNo.trim() || undefined,
        notes: notes.trim() || undefined,
        lossWeight,
        parts: parts.map((part) => ({
          lotName: part.lotName,
          quantity: part.quantity,
          weight: part.weight,
          totalCost: part.totalCost,
          labAccountName: part.labAccountName,
          certificateNo: part.certificateNo,
          parcelOrStone: part.parcelOrStone,
          shape: part.shape,
          color: part.color,
          clarity: part.clarity,
          remark: part.remark,
        })),
      });

      toast.success(
        `Parts returned: ${response.data.productionDocument.productionNo}`,
      );
      router.push("/user/inventory/inventory-list");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Failed to return parts.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canReturnParts) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to return production parts in this company.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-[1200px] space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Production
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Return Parts</h1>
            <p className="text-sm text-muted-foreground">
              {currentCompany?.name ?? "Selected company"}
            </p>
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
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Lot ID" required error={lookupError ?? undefined}>
              <div className="relative">
                <Input
                  type="number"
                  min="1"
                  step="1"
                  value={lotId}
                  onChange={(event) => setLotId(event.target.value)}
                  className="h-10 rounded-xl pr-10"
                />
                {lookupLoading && (
                  <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-muted-foreground" />
                )}
              </div>
            </Field>
            <Field label="Return Location" required>
              <Input
                value={returnLocationAccountName}
                onChange={(event) => setReturnLocationAccountName(event.target.value)}
                className="h-10 rounded-xl"
                placeholder="Main Stock"
              />
            </Field>
            <Field label="Doc Date">
              <Input
                type="date"
                value={docDate}
                onChange={(event) => setDocDate(event.target.value)}
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Loss Weight">
              <Input
                type="number"
                min="0"
                step="0.0001"
                value={lossWeight}
                onChange={(event) => setLossWeight(event.target.value)}
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
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Process Item</h2>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Company">
              <Input value={companyLabel(item)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Department">
              <Input value={item?.department?.name ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Item">
              <Input value={itemLabel(item)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Source Process">
              <Input value={sourceDocumentLabel(sourceProduction)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Original Weight">
              <Input value={item ? formatNumber(item.weight, 4) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Returned Weight">
              <Input value={formatNumber(totals.weight, 4)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Loss Weight">
              <Input value={formatNumber(Number(lossWeight || 0), 4)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Balance">
              <Input value={item ? formatNumber(item.weight - totalWithLoss, 4) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
          </div>
          {overweight && (
            <div className="mx-5 mb-5 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              Returned weight plus loss cannot exceed original process weight.
            </div>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border bg-background">
          <div className="flex items-center justify-between border-b px-5 py-4">
            <h2 className="text-sm font-semibold">Returned Parts</h2>
            <Button
              type="button"
              variant="outline"
              className="h-8 rounded-xl"
              onClick={addPart}
              disabled={!item}
            >
              <Plus className="h-4 w-4" />
              Add Part
            </Button>
          </div>

          <div className="space-y-4 p-5">
            {parts.map((part, index) => (
              <div key={part.rowId} className="rounded-2xl border p-4">
                <div className="mb-4 flex items-center justify-between">
                  <p className="text-sm font-semibold">Part {index + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-xl text-muted-foreground"
                    onClick={() => removePart(part.rowId)}
                    disabled={parts.length === 1}
                    aria-label={`Remove part ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Lot Name" required>
                    <Input
                      value={part.lotName}
                      onChange={(event) =>
                        updatePart(part.rowId, "lotName", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Quantity" required>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={part.quantity}
                      onChange={(event) =>
                        updatePart(part.rowId, "quantity", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Weight" required>
                    <Input
                      type="number"
                      min="0.0001"
                      step="0.0001"
                      value={part.weight}
                      onChange={(event) =>
                        updatePart(part.rowId, "weight", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Total Cost" required>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={part.totalCost}
                      onChange={(event) =>
                        updatePart(part.rowId, "totalCost", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Certificate No">
                    <Input
                      value={part.certificateNo ?? ""}
                      onChange={(event) =>
                        updatePart(part.rowId, "certificateNo", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Lab">
                    <Input
                      value={part.labAccountName ?? ""}
                      onChange={(event) =>
                        updatePart(part.rowId, "labAccountName", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Parcel / Stone">
                    <Select
                      value={part.parcelOrStone ?? "STONE"}
                      onValueChange={(value) =>
                        updatePart(part.rowId, "parcelOrStone", value)
                      }
                    >
                      <SelectTrigger className="h-10 w-full rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="STONE">Stone</SelectItem>
                        <SelectItem value="PARCEL">Parcel</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Shape">
                    <Input
                      value={part.shape ?? ""}
                      onChange={(event) =>
                        updatePart(part.rowId, "shape", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Color">
                    <Input
                      value={part.color ?? ""}
                      onChange={(event) =>
                        updatePart(part.rowId, "color", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Clarity">
                    <Input
                      value={part.clarity ?? ""}
                      onChange={(event) =>
                        updatePart(part.rowId, "clarity", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                  <Field label="Remark">
                    <Input
                      value={part.remark ?? ""}
                      onChange={(event) =>
                        updatePart(part.rowId, "remark", event.target.value)
                      }
                      className="h-10 rounded-xl"
                    />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => router.back()}
            disabled={isSubmitting}
          >
            Close
          </Button>
          <Button
            type="submit"
            className="h-9 rounded-xl"
            disabled={
              isSubmitting ||
              lookupLoading ||
              !item ||
              parts.length === 0 ||
              overweight ||
              !returnLocationAccountName.trim()
            }
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RotateCcw className="h-4 w-4" />
            )}
            Save and Close
          </Button>
        </div>
      </form>
    </div>
  );
}
