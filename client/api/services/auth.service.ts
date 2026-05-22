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

export interface BasicAuthResponse {
  success: boolean;
  message: string;
  data: Record<string, never>;
}

export async function loginService(payload: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  const response = await axiosInstance.post(AUTH_API.login, payload);
  return response.data;
}

export async function getCurrentSessionService(): Promise<Omit<LoginResponse, "data"> & {
  data: Omit<LoginResponse["data"], "accessToken">;
}> {
  const response = await axiosInstance.get(AUTH_API.me);
  return response.data;
}

export async function forgotPasswordService(payload: {
  email: string;
}): Promise<BasicAuthResponse> {
  const response = await axiosInstance.post(AUTH_API.forgotPassword, payload);
  return response.data;
}

export async function resetPasswordService(payload: {
  email: string;
  otp: string;
  password: string;
}): Promise<BasicAuthResponse> {
  const response = await axiosInstance.post(AUTH_API.resetPassword, payload);
  return response.data;
}
