"use client";

import NewPurchaseNoteForm from "@/components/purchase/NewPurchaseNoteForm";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";

export default function NewPurchaseNotePage() {
  const user = useAppSelector((state) => state.auth.user);
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const departmentAccesses = user?.departmentAccesses ?? [];
  const canCreateInAssignedDepartment = departmentAccesses.some((access) =>
    permissionAllows(
      permissionsToMap(access.permissions).NEW_PURCHASE_NOTE,
      "READ_WRITE",
    ),
  );
  const canCreatePurchaseNote =
    canCreateInAssignedDepartment ||
    permissionAllows(persistedPermissions.NEW_PURCHASE_NOTE, "READ_WRITE");

  if (!canCreatePurchaseNote) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create purchase notes in this department.
        </div>
      </div>
    );
  }

  return <NewPurchaseNoteForm />;
}
