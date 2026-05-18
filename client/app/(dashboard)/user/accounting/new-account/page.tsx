"use client";

import AccountForm from "@/components/accounting/Forms/CustomerForm";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";

export default function NewAccountPage() {
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
  const canCreateAccount = permissionAllows(
    permissionMap.NEW_ACCOUNT,
    "READ_WRITE",
  );

  if (!canCreateAccount) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create accounts in this department.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <AccountForm />
    </div>
  );
}
