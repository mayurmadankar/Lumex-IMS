import { AUTH_API } from "@/api/auth-api";
import axiosInstance from "@/api/axios";
import type {
  CompanyOption,
  DepartmentAccessOption,
  PermissionMap,
  UserRole,
} from "@/store/types/types";

export interface LoginUser {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  orgId?: string;
  primaryCompanyId: string | null;
  companyId: string | null;
  accessibleCompanyIds: string[];
  selectedCompanyId: string | null;
  selectedDepartmentId: string | null;
  permissions: PermissionMap;
  departmentAccesses: DepartmentAccessOption[];
  isActive: boolean;
}

export interface LoginResponse {
  success: boolean;
  message: string;
  data: {
    accessToken: string;
    user: LoginUser;
    accessibleCompanies: CompanyOption[];
    orgAdminProfile: null | {
      id: string;
      billingEmail: string | null;
      activePlan: boolean;
    };
  };
}

export async function loginService(payload: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const response = await axiosInstance.post(AUTH_API.login, payload);
  return response.data;
}
