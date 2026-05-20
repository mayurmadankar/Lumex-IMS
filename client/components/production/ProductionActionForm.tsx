"use client";

import { ArrowLeft, Loader2, MapPin, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import type { InventoryItemListItem } from "@/api/services/inventory.service";
import {
  changeInventoryLocation,
  getProductionInventoryItemByLot,
  sendInventoryToProcess,
} from "@/api/services/production.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import { useCompanyAccess } from "@/hooks/use-company-access";

type ProductionActionMode = "change-location" | "send-to-process";

const config = {
  "change-location": {
    eyebrow: "Production",
    title: "Change Location",
    module: "CHANGE_LOCATION",
    denied: "You do not have permission to change locations in this company.",
    targetLabel: "New Location Account",
    targetPlaceholder: "Main Stock / Safe / Process Desk",
    successLabel: "Location changed",
    icon: MapPin,
  },
  "send-to-process": {
    eyebrow: "Production",
    title: "Send To Process",
    module: "SEND_TO_PROCESS",
    denied: "You do not have permission to send items to process in this company.",
    targetLabel: "Process Account",
    targetPlaceholder: "Cutting / Polishing / Certification",
    successLabel: "Item sent to process",
    icon: Send,
  },
} as const;

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

export default function ProductionActionForm({
  mode,
}: {
  mode: ProductionActionMode;
}) {
  const router = useRouter();
  const { currentCompany, hasCompanyPermission } = useCompanyAccess();
  const flow = config[mode];
  const Icon = flow.icon;
  const canUse = hasCompanyPermission(flow.module, "READ_WRITE");
  const [lotId, setLotId] = useState("");
  const [inventoryItem, setInventoryItem] = useState<InventoryItemListItem | null>(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [targetLocation, setTargetLocation] = useState("");
  const [docDate, setDocDate] = useState(todayInputValue());
  const [expectedReturnDate, setExpectedReturnDate] = useState("");
  const [referenceDocNo, setReferenceDocNo] = useState("");
  const [notes, setNotes] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const targetIsSameAsCurrent = useMemo(
    () =>
      mode === "change-location" &&
      targetLocation.trim() &&
      targetLocation.trim() === inventoryItem?.locationAccountName,
    [inventoryItem?.locationAccountName, mode, targetLocation],
  );

  useEffect(() => {
    const value = lotId.trim();
    setInventoryItem(null);
    setLookupError(null);

    if (!value) return;

    const parsedLotId = Number(value);
    if (!currentCompany?.id || !Number.isInteger(parsedLotId) || parsedLotId <= 0) {
      setLookupError("Enter a valid Lot ID.");
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        setLookupLoading(true);
        const response = await getProductionInventoryItemByLot("user", parsedLotId, {
          companyId: currentCompany.id,
        });
        setInventoryItem(response.data.inventoryItem ?? null);
      } catch (error: unknown) {
        const apiError = error as { response?: { data?: { message?: string } } };
        setLookupError(
          apiError.response?.data?.message ??
            "No available stock item found for this Lot ID.",
        );
      } finally {
        setLookupLoading(false);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [currentCompany?.id, lotId]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!currentCompany?.id || !inventoryItem) {
      toast.error("Enter a valid Lot ID first.");
      return;
    }

    if (!targetLocation.trim()) {
      toast.error(`${flow.targetLabel} is required.`);
      return;
    }

    if (targetIsSameAsCurrent) {
      toast.error("Select a different location.");
      return;
    }

    try {
      setIsSubmitting(true);
      const payloadBase = {
        companyId: currentCompany.id,
        inventoryItemId: inventoryItem.id,
        docDate,
        referenceDocNo: referenceDocNo.trim() || undefined,
        notes: notes.trim() || undefined,
      };

      const response =
        mode === "change-location"
          ? await changeInventoryLocation("user", {
              ...payloadBase,
              toLocationAccountName: targetLocation.trim(),
            })
          : await sendInventoryToProcess("user", {
              ...payloadBase,
              processAccountName: targetLocation.trim(),
              expectedReturnDate: expectedReturnDate || undefined,
            });

      toast.success(
        `${flow.successLabel}: ${response.data.productionDocument.productionNo}`,
      );
      router.push("/user/inventory/inventory-list");
    } catch (error: unknown) {
      const apiError = error as { response?: { data?: { message?: string } } };
      toast.error(apiError.response?.data?.message ?? "Production action failed.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canUse) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          {flow.denied}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <form onSubmit={handleSubmit} className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {flow.eyebrow}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">{flow.title}</h1>
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
          <div className="border-b px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/40">
                <Icon className="h-4 w-4" />
              </div>
              <p className="text-sm font-semibold">{flow.title}</p>
            </div>
          </div>

          <div className="grid gap-4 p-5 md:grid-cols-2">
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
            <Field label={flow.targetLabel} required>
              <Input
                value={targetLocation}
                onChange={(event) => setTargetLocation(event.target.value)}
                className="h-10 rounded-xl"
                placeholder={flow.targetPlaceholder}
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
            {mode === "send-to-process" && (
              <Field label="Expected Return Date">
                <Input
                  type="date"
                  value={expectedReturnDate}
                  onChange={(event) => setExpectedReturnDate(event.target.value)}
                  className="h-10 rounded-xl"
                />
              </Field>
            )}
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
            <h2 className="text-sm font-semibold">Item Details</h2>
          </div>
          <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-4">
            <Field label="Company">
              <Input value={companyLabel(inventoryItem)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Department">
              <Input value={inventoryItem?.department?.name ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Item">
              <Input value={itemLabel(inventoryItem)} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Lot Name">
              <Input value={inventoryItem?.lotName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Quantity">
              <Input value={inventoryItem ? String(inventoryItem.quantity) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Weight">
              <Input value={inventoryItem ? formatNumber(inventoryItem.weight, 4) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Total Cost">
              <Input value={inventoryItem ? formatNumber(inventoryItem.totalCost) : ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Certificate No">
              <Input value={inventoryItem?.certificateNo ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Current Status">
              <Input value={inventoryItem?.status ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Current Location">
              <Input value={inventoryItem?.locationAccountName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Vendor / Account">
              <Input value={inventoryItem?.vendorAccount?.accountName ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
            <Field label="Parcel / Stone">
              <Input value={inventoryItem?.parcelOrStone ?? ""} readOnly className="h-10 rounded-xl bg-muted" />
            </Field>
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
              !inventoryItem ||
              !targetLocation.trim() ||
              Boolean(targetIsSameAsCurrent)
            }
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Icon className="h-4 w-4" />
            )}
            Save and Close
          </Button>
        </div>
      </form>
    </div>
  );
}
