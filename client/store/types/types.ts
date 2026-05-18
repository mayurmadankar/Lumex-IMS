import type { GroupPermission, ModuleKey, PermissionLevel } from "@/config/modules";

export type UserRole = "ORG_ADMIN" | "USER";

export type { ModuleKey, PermissionLevel };

export type PermissionMap = Partial<Record<ModuleKey, PermissionLevel>>;

export interface CompanyOption {
  id: string;
  name: string;
  code?: string | null;
  status?: "ACTIVE" | "INACTIVE";
}

export interface DepartmentAccessOption {
  id: string;
  departmentId: string;
  departmentName: string;
  country: string;
  companyId: string;
  companyName: string;
  companyCode?: string | null;
  companyStatus?: "ACTIVE" | "INACTIVE";
  permissions: GroupPermission[];
}
