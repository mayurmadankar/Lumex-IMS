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
  const selectedDepartmentId =
    user?.selectedDepartmentId ?? departmentAccesses[0]?.departmentId ?? null;
  const selectedAccess =
    departmentAccesses.find(
      (access) => access.departmentId === selectedDepartmentId,
    ) ?? departmentAccesses[0];
  const permissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : persistedPermissions;
  const canCreateMemo = permissionAllows(permissionMap.NEW_MEMO_IN, "READ_WRITE");

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
