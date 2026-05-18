import axiosInstance from "@/api/axios";

export type CompanyPayload = {
  name: string;
  code?: string;
  country: string;
  companyEmail: string;
  defaultDepartmentName?: string;
};

export type UpdateCompanyPayload = Partial<CompanyPayload> & {
  status?: "ACTIVE" | "INACTIVE";
};

export type DepartmentPayload = {
  name: string;
  country: string;
  description?: string;
};

export async function createCompany(payload: CompanyPayload) {
  const response = await axiosInstance.post("/api/admin/createCompany", payload);
  return response.data;
}

export async function getCompanies() {
  const response = await axiosInstance.get("/api/admin/companies");
  return response.data;
}

export async function updateCompany(id: string, payload: UpdateCompanyPayload) {
  const response = await axiosInstance.post(`/api/admin/company/${id}`, payload);
  return response.data;
}

export async function getCompany(id: string) {
  const response = await axiosInstance.get(`/api/admin/company/${id}`);
  return response.data;
}

export async function createDepartment(companyId: string, payload: DepartmentPayload) {
  const response = await axiosInstance.post(`/api/admin/createDepartment/${companyId}`, payload);
  return response.data;
}

// api/services/analytics.service.ts
export async function getDashboardAnalytics() {
  const response = await axiosInstance.get("/api/admin/analytics/dashboard");
  return response.data;
}
