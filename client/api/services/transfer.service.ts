import axiosInstance from "@/api/axios";
import type { InventoryItemListItem } from "@/api/services/inventory.service";

type Scope = "user";

export type TransferDepartment = {
  id: string;
  name: string;
  country: string;
  companyId: string;
  company?: {
    id: string;
    name: string;
    code?: string | null;
  };
};

export type TransferDepartmentUser = {
  id: string;
  fullName: string;
  email: string;
};

export type CreateTransferPayload = {
  transferMode?: "DEPARTMENT" | "COMPANY";
  companyId: string;
  destinationCompanyId?: string;
  inventoryItemId: string;
  toDepartmentId: string;
  toUserId: string;
  referenceDocNo?: string;
  docDate?: string;
  notes?: string;
};

export type TransferListItem = {
  id: string;
  docId: number;
  transferNo: string;
  docType: "Transfer" | "Company Transfer" | "Transfer Return";
  docDate: string;
  referenceDocNo?: string | null;
  notes?: string | null;
  createdAt: string;
  company: {
    id: string;
    name: string;
    code?: string | null;
  };
  fromDepartment: {
    id: string;
    name: string;
    company?: {
      id: string;
      name: string;
      code?: string | null;
    };
  };
  toDepartment: {
    id: string;
    name: string;
    company?: {
      id: string;
      name: string;
      code?: string | null;
    };
  };
  toUser?: TransferDepartmentUser | null;
  createdBy?: TransferDepartmentUser | null;
  inventoryItem?: InventoryItemListItem | null;
};

export type TransferReturnItem = {
  inventoryItem: InventoryItemListItem;
  transfer: TransferListItem;
  returnToDepartment: {
    id: string;
    name: string;
  };
  returnToUser?: TransferDepartmentUser | null;
};

export type CreateTransferReturnPayload = {
  companyId: string;
  inventoryItemId: string;
  referenceDocNo?: string;
  docDate?: string;
  notes?: string;
};

export async function getTransferDepartments(
  scope: Scope,
  params: { companyId: string },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/transfer-departments`,
    { params },
  );
  return response.data;
}

export async function getTransferDepartmentUsers(
  scope: Scope,
  departmentId: string,
) {
  const response = await axiosInstance.get(
    `/api/${scope}/transfer-departments/${departmentId}/users`,
  );
  return response.data;
}

export async function createTransfer(
  scope: Scope,
  payload: CreateTransferPayload,
) {
  const response = await axiosInstance.post(`/api/${scope}/transfers`, payload);
  return response.data;
}

export async function getTransfers(
  scope: Scope,
  params: {
    companyId?: string;
    departmentId?: string;
    search?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/transfers`, {
    params,
  });
  return response.data;
}

export async function getTransferReturnItemByLot(
  scope: Scope,
  lotId: number | string,
  params: { companyId: string },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/transfer-return-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function createTransferReturn(
  scope: Scope,
  payload: CreateTransferReturnPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/transfers/return`,
    payload,
  );
  return response.data;
}
