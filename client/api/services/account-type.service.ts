import axiosInstance from "@/api/axios";

type Scope = "admin" | "user";

export type AccountTypeOption = {
  id: string;
  name: string;
  createdAt: string;
};

export async function getAccountTypes(scope: Scope = "user") {
  const response = await axiosInstance.get(`/api/${scope}/account-type`);
  return response.data;
}
