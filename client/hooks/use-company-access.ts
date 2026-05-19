import { useMemo } from "react";

import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";
import type {
  CompanyOption,
  DepartmentAccessOption,
  ModuleKey,
  PermissionLevel,
} from "@/store/types/types";

type RequiredPermission = Exclude<PermissionLevel, "NONE">;

export function useCompanyAccess() {
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const persistedPermissions = useAppSelector(
    (state) => state.permission.permissions,
  );

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

  const currentCompany = useMemo<CompanyOption | null>(() => {
    if (!selectedCompanyId && selectedAccess) {
      return {
        id: selectedAccess.companyId,
        name: selectedAccess.companyName,
        code: selectedAccess.companyCode,
        status: selectedAccess.companyStatus,
      };
    }

    return (
      accessibleCompanies.find((company) => company.id === selectedCompanyId) ??
      (selectedAccess
        ? {
            id: selectedAccess.companyId,
            name: selectedAccess.companyName,
            code: selectedAccess.companyCode,
            status: selectedAccess.companyStatus,
          }
        : null)
    );
  }, [accessibleCompanies, selectedAccess, selectedCompanyId]);

  const companyDepartmentAccesses = useMemo<DepartmentAccessOption[]>(
    () =>
      departmentAccesses.filter(
        (access) => access.companyId === currentCompany?.id,
      ),
    [currentCompany?.id, departmentAccesses],
  );

  const permissionMap = selectedAccess
    ? permissionsToMap(selectedAccess.permissions)
    : persistedPermissions;

  const hasCompanyPermission = (
    module: ModuleKey,
    required: RequiredPermission = "READ_ONLY",
  ) => {
    if (user?.role === "ORG_ADMIN") return true;

    return currentCompany
      ? companyDepartmentAccesses.some((access) =>
          permissionAllows(permissionsToMap(access.permissions)[module], required),
        )
      : permissionAllows(permissionMap[module], required);
  };

  return {
    currentCompany,
    companyDepartmentAccesses,
    departmentAccesses,
    selectedAccess,
    selectedDepartmentId,
    hasCompanyPermission,
  };
}
