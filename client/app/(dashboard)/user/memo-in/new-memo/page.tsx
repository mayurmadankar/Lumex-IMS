"use client";

import NewMemoForm from "@/components/memo/NewMemoForm";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";

export default function NewMemoPage() {
  const user = useAppSelector((state) => state.auth.user);
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );
  const departmentAccesses = user?.departmentAccesses ?? [];
  const canCreateInAssignedDepartment = departmentAccesses.some((access) =>
    permissionAllows(
      permissionsToMap(access.permissions).NEW_MEMO_IN,
      "READ_WRITE",
    ),
  );
  const canCreateMemo =
    canCreateInAssignedDepartment ||
    permissionAllows(persistedPermissions.NEW_MEMO_IN, "READ_WRITE");

  if (!canCreateMemo) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create memos in this department.
        </div>
      </div>
    );
  }

  return <NewMemoForm />;
}
