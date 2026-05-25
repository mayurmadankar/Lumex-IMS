"use client";

import { Check, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { createItem, deleteItem, getItems, updateItem } from "@/api/services/item.service";
import type { ItemListItem, UnitOfWeight } from "@/api/services/item.service";
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
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";

const unitOfWeightOptions: Array<{ value: UnitOfWeight; label: string }> = [
  { value: "CARATS", label: "Carats" },
  { value: "GRAMS", label: "Grams" },
];

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

export default function AdminItemListPage() {
  const [items, setItems] = useState<ItemListItem[]>([]);
  const [search, setSearch] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemType, setItemType] = useState("");
  const [uow, setUow] = useState<UnitOfWeight>("CARATS");
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemType, setEditItemType] = useState("");
  const [editUow, setEditUow] = useState<UnitOfWeight>("CARATS");
  const [itemsLoading, setItemsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [updatingItemId, setUpdatingItemId] = useState<string | null>(null);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadItems = async () => {
      try {
        setItemsLoading(true);
        setError(null);
        const response = await getItems("admin");
        setItems(response.data.items ?? []);
      } catch {
        setItems([]);
        setError("Failed to load items.");
      } finally {
        setItemsLoading(false);
      }
    };

    loadItems();
  }, []);

  const filteredItems = useMemo(() => {
    const value = search.trim();
    if (!value) return items;

    return items.filter((item) =>
      matchesTableSearch(
        [
          item.itemId,
          item.itemName,
          item.itemType,
          item.uow,
          item.createdBy?.fullName,
          item.createdBy?.email,
        ],
        value,
      ),
    );
  }, [items, search]);
  const { paginatedItems, ...itemPagination } = usePagination(filteredItems);

  const resetForm = () => {
    setItemName("");
    setItemType("");
    setUow("CARATS");
  };

  const startEdit = (item: ItemListItem) => {
    setEditingItemId(item.id);
    setEditItemName(item.itemName);
    setEditItemType(item.itemType);
    setEditUow(item.uow);
  };

  const cancelEdit = () => {
    setEditingItemId(null);
    setEditItemName("");
    setEditItemType("");
    setEditUow("CARATS");
  };

  const handleCreateItem = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!itemName.trim() || !itemType.trim()) {
      toast.error("Enter item name and item type.");
      return;
    }

    try {
      setSaving(true);
      const response = await createItem("admin", {
        itemName: itemName.trim(),
        itemType: itemType.trim(),
        uow,
        uom: "PCS",
      });
      const item = response.data.item as ItemListItem;
      setItems((current) =>
        [...current, item].sort((a, b) => a.itemId - b.itemId),
      );
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

  const handleUpdateItem = async (item: ItemListItem) => {
    if (!editItemName.trim() || !editItemType.trim()) {
      toast.error("Enter item name and item type.");
      return;
    }

    try {
      setUpdatingItemId(item.id);
      const response = await updateItem("admin", item.id, {
        itemName: editItemName.trim(),
        itemType: editItemType.trim(),
        uow: editUow,
        uom: item.uom,
      });
      const updatedItem = response.data.item as ItemListItem;
      setItems((current) =>
        current
          .map((currentItem) =>
            currentItem.id === updatedItem.id ? updatedItem : currentItem,
          )
          .sort((a, b) => a.itemId - b.itemId),
      );
      cancelEdit();
      toast.success(`Item updated: ${updatedItem.itemId}`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to update item.");
    } finally {
      setUpdatingItemId(null);
    }
  };

  const handleDeleteItem = async (item: ItemListItem) => {
    const confirmed = window.confirm(`Delete item ${item.itemId} - ${item.itemName}?`);
    if (!confirmed) return;

    try {
      setDeletingItemId(item.id);
      await deleteItem("admin", item.id);
      setItems((current) => current.filter((currentItem) => currentItem.id !== item.id));
      if (editingItemId === item.id) cancelEdit();
      toast.success(`Item deleted: ${item.itemId}`);
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(apiError.response?.data?.message ?? "Failed to delete item.");
    } finally {
      setDeletingItemId(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto w-full max-w-none space-y-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Master Data
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">Item List</h1>
          <p className="text-sm text-muted-foreground">
            {filteredItems.length} global records found
          </p>
        </div>

        <form
          onSubmit={handleCreateItem}
          className="grid gap-4 rounded-2xl border bg-background p-4 md:grid-cols-[140px_1fr_1fr_160px_auto]"
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
            <Select
              value={uow}
              onValueChange={(value) => setUow(value as UnitOfWeight)}
            >
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
          <div className="flex items-end">
            <Button
              type="submit"
              className="h-10 w-full rounded-xl"
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </Button>
          </div>
        </form>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search items"
        />

        {itemsLoading ? (
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
                    <th className="px-3 py-3 font-medium">Created By</th>
                    <th className="px-3 py-3 font-medium">Created</th>
                    <th className="px-3 py-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((item) => {
                    const isEditing = editingItemId === item.id;
                    const isUpdating = updatingItemId === item.id;
                    const isDeleting = deletingItemId === item.id;

                    return (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="px-3 py-3 font-semibold text-blue-600">
                          {item.itemId}
                        </td>
                        <td className="px-3 py-3">
                          {isEditing ? (
                            <Input
                              value={editItemName}
                              onChange={(event) => setEditItemName(event.target.value)}
                              className="h-9 rounded-xl"
                            />
                          ) : (
                            item.itemName
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {isEditing ? (
                            <Input
                              value={editItemType}
                              onChange={(event) => setEditItemType(event.target.value)}
                              className="h-9 rounded-xl"
                            />
                          ) : (
                            item.itemType
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {isEditing ? (
                            <Select
                              value={editUow}
                              onValueChange={(value) => setEditUow(value as UnitOfWeight)}
                            >
                              <SelectTrigger className="h-9 w-full rounded-xl">
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
                          ) : (
                            item.uow
                          )}
                        </td>
                        <td className="px-3 py-3">
                          {item.createdBy?.fullName ?? "-"}
                        </td>
                        <td className="px-3 py-3">
                          {formatDate(item.createdAt)}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-2">
                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  className="h-8 rounded-xl"
                                  onClick={() => handleUpdateItem(item)}
                                  disabled={isUpdating || isDeleting}
                                >
                                  {isUpdating ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Check className="h-3.5 w-3.5" />
                                  )}
                                  Save
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-xl"
                                  onClick={cancelEdit}
                                  disabled={isUpdating}
                                >
                                  <X className="h-3.5 w-3.5" />
                                  Cancel
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-xl"
                                  onClick={() => startEdit(item)}
                                  disabled={Boolean(updatingItemId || deletingItemId)}
                                >
                                  <Pencil className="h-3.5 w-3.5" />
                                  Edit
                                </Button>
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-8 rounded-xl text-destructive hover:text-destructive"
                                  onClick={() => handleDeleteItem(item)}
                                  disabled={Boolean(updatingItemId || deletingItemId)}
                                >
                                  {isDeleting ? (
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                  ) : (
                                    <Trash2 className="h-3.5 w-3.5" />
                                  )}
                                  Delete
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
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
