import axiosInstance from "@/api/axios";
import type { GroupPermission } from "@/config/modules";

export type CreateUserPayload = {
  fullName: string;
  email: string;
  password: string;
  companyId: string;
  departmentAccesses?: Array<{
    departmentId: string;
    permissions?: GroupPermission[];
  }>;
};

export async function createUser(payload: CreateUserPayload) {
  const response = await axiosInstance.post("/api/admin/user", payload);
  return response.data;
}

export async function getUsers() {
  const response = await axiosInstance.get("/api/admin/users");
  return response.data;
}

export async function getUser(id: string) {
  const response = await axiosInstance.get(`/api/admin/user/${id}`);
  return response.data;
}

export async function updateDepartmentPermissions(
  accessId: string,
  permissions: GroupPermission[],
) {
  const response = await axiosInstance.patch(
    `/api/admin/department-access/${accessId}/permissions`,
    { permissions }
  );
  return response.data;
}

export async function updateUser(id: string, payload: { email: string; isActive: boolean }) {
  const response = await axiosInstance.patch(`/api/admin/users/${id}`, payload);
  return response.data;
}

export async function addUserDepartment(userId: string, departmentId: string) {
  const response = await axiosInstance.post(`/api/admin/users/${userId}/departments`, { departmentId });
  return response.data;
}

export async function removeUserDepartment(userId: string, departmentId: string) {
  const response = await axiosInstance.delete(`/api/admin/users/${userId}/departments/${departmentId}`);
  return response.data;
}
