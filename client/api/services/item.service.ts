import axiosInstance from "@/api/axios";

type Scope = "user" | "admin";

export type UnitOfWeight = "CARATS" | "GRAMS";
export type UnitOfMeasurement = "PCS" | "WEIGHT";

export type ItemPayload = {
  itemName: string;
  itemType: string;
  uow: UnitOfWeight;
  uom: UnitOfMeasurement;
};

export type ItemListItem = {
  id: string;
  itemId: number;
  itemName: string;
  itemType: string;
  uow: UnitOfWeight;
  uom: UnitOfMeasurement;
  createdAt: string;
  company?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
};

export async function createItem(scope: Scope, payload: ItemPayload) {
  const response = await axiosInstance.post(`/api/${scope}/items`, payload);
  return response.data;
}

export async function updateItem(scope: Scope, id: string, payload: ItemPayload) {
  const response = await axiosInstance.patch(`/api/${scope}/items/${id}`, payload);
  return response.data;
}

export async function deleteItem(scope: Scope, id: string) {
  const response = await axiosInstance.delete(`/api/${scope}/items/${id}`);
  return response.data;
}

export async function getItems(
  scope: Scope,
  params: {
    departmentId?: string;
    companyId?: string;
    search?: string;
  } = {},
) {
  const response = await axiosInstance.get(`/api/${scope}/items`, { params });
  return response.data;
}
