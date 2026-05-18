"use client";

import { Loader2, Plus, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { createItem, getItems } from "@/api/services/item.service";
import type {
  ItemListItem,
  UnitOfMeasurement,
  UnitOfWeight,
} from "@/api/services/item.service";
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
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";
import { useAppSelector } from "@/store/hooks";

const unitOfWeightOptions: Array<{ value: UnitOfWeight; label: string }> = [
  { value: "CARATS", label: "Carats" },
  { value: "GRAMS", label: "Grams" },
];

const unitOfMeasurementOptions: Array<{
  value: UnitOfMeasurement;
  label: string;
}> = [
  { value: "PCS", label: "Pcs" },
  { value: "WEIGHT", label: "Weight" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function ItemListPage() {
  const user = useAppSelector((state) => state.auth.user);
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [search, setSearch] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState("");
  const [uow, setUow] = useState<UnitOfWeight>("CARATS");
  const [uom, setUom] = useState<UnitOfMeasurement>("PCS");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  const canReadItems = permissionAllows(permissionMap.ITEM_LIST, "READ_ONLY");
  const canWriteItems = permissionAllows(permissionMap.ITEM_LIST, "READ_WRITE");

  useEffect(() => {
    if (!canReadItems || !selectedDepartmentId) {
      setLoading(false);
      return;
    }

    const loadItems = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getItems("user", {
          departmentId: selectedDepartmentId,
        });
        setItems(response.data.items ?? []);
      } catch {
        setError("Failed to load items.");
      } finally {
        setLoading(false);
      }
    };

    loadItems();
  }, [canReadItems, selectedDepartmentId]);

  const filteredItems = useMemo(() => {
    const value = search.trim().toLowerCase();
    if (!value) return items;

    return items.filter((item) =>
      [item.itemId, item.itemName, item.itemType, item.uow, item.uom]
        .filter(Boolean)
        .some((entry) => String(entry).toLowerCase().includes(value)),
    );
  }, [items, search]);
  const { paginatedItems, ...itemPagination } = usePagination(filteredItems);

  const resetForm = () => {
    setItemName("");
    setItemType("");
    setUow("CARATS");
    setUom("PCS");
  };

  const handleCreateItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!selectedDepartmentId) {
      toast.error("Select a department before creating an item.");
      return;
    }

    if (!itemName.trim() || !itemType.trim()) {
      toast.error("Enter item name and item type.");
      return;
    }

    try {
      setSaving(true);
      const response = await createItem("user", {
        departmentId: selectedDepartmentId,
        itemName: itemName.trim(),
        itemType: itemType.trim(),
        uow,
        uom,
      });
      const item = response.data.item as ItemListItem;
      setItems((current) => [...current, item].sort((a, b) => a.itemId - b.itemId));
      resetForm();
      toast.success(`Item created: ${item.itemId}`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to create item.");
    } finally {
      setSaving(false);
    }
  };

  if (!canReadItems) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to view items in this department.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-[1200px] space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Inventory
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Item List</h1>
          <p className="text-sm text-muted-foreground">
            {filteredItems.length} records found
          </p>
        </div>

        {canWriteItems && (
          <form
            onSubmit={handleCreateItem}
            className="grid gap-4 rounded-2xl border bg-background p-4 md:grid-cols-[140px_1fr_1fr_160px_160px_auto]"
          >
            <Field label="Item ID">
              <Input value="System" disabled className="h-10 rounded-xl" />
            </Field>
            <Field label="Item Name" required>
              <Input
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="Item name"
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="Item Type" required>
              <Input
                value={itemType}
                onChange={(event) => setItemType(event.target.value)}
                placeholder="Item type"
                className="h-10 rounded-xl"
              />
            </Field>
            <Field label="UOW" required>
              <Select value={uow} onValueChange={(value) => setUow(value as UnitOfWeight)}>
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOfWeightOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="UOM" required>
              <Select
                value={uom}
                onValueChange={(value) => setUom(value as UnitOfMeasurement)}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {unitOfMeasurementOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <div className="flex items-end">
              <Button type="submit" className="h-10 w-full rounded-xl" disabled={saving}>
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Add
              </Button>
            </div>
          </form>
        )}

        <div className="flex items-center gap-2 rounded-2xl border bg-background px-3 py-2">
          <Search className="h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search items"
            className="h-9 border-0 px-0 shadow-none focus-visible:ring-0"
          />
        </div>

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading items...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No items found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Item ID</th>
                    <th className="px-3 py-3 font-medium">Item Name</th>
                    <th className="px-3 py-3 font-medium">Item Type</th>
                    <th className="px-3 py-3 font-medium">UOW</th>
                    <th className="px-3 py-3 font-medium">UOM</th>
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => (
                    <tr key={item.id} className="border-b last:border-0">
                      <td className="px-3 py-3 font-semibold text-blue-600">
                        {item.itemId}
                      </td>
                      <td className="px-3 py-3">{item.itemName}</td>
                      <td className="px-3 py-3">{item.itemType}</td>
                      <td className="px-3 py-3">{item.uow}</td>
                      <td className="px-3 py-3">{item.uom}</td>
                      <td className="px-3 py-3">
                        {item.company.code
                          ? `${item.company.name} (${item.company.code})`
                          : item.company.name}
                      </td>
                      <td className="px-3 py-3">{formatDate(item.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={itemPagination.page}
              totalPages={itemPagination.totalPages}
              start={itemPagination.start}
              end={itemPagination.end}
              total={itemPagination.total}
              onPageChange={itemPagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
