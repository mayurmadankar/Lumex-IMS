import axiosInstance from "@/api/axios";
import type { InventoryItemListItem } from "@/api/services/inventory.service";

type Scope = "user";

type TransactionUser = {
  id: string;
  fullName: string;
  email: string;
};

export type MemoOutDocumentLink = {
  id: string;
  docId: number;
  memoNo: string;
  docType: string;
  docDate: string;
  status: "ACTIVE" | "CANCELLED";
};

export type MemoOutAccount = {
  id: string;
  accountName: string;
  accountLongName?: string | null;
  accountIndex?: string | null;
  address?: string | null;
  address2?: string | null;
  countryIso2?: string | null;
  state?: {
    id: string;
    name: string;
    code: string;
  } | null;
  city?: string | null;
  zipCode?: string | null;
  phone1?: string | null;
  phone2?: string | null;
  email?: string | null;
  website?: string | null;
  trnNo?: string | null;
  companyId: string;
  accountType?: {
    id: string;
    name: string;
  };
};

export type MemoOutListItem = {
  id: string;
  docId: number;
  memoNo: string;
  docType: "Memo Out" | "Memo Out Return" | string;
  openDate: string;
  docDate: string;
  referenceDocNo?: string | null;
  itemType?: string | null;
  docQty: number;
  docWeight: number;
  docGrandTotalPrice: number;
  mainGrandTotalPrice: number;
  balanceAmount: number;
  paymentTerm: number | null;
  currency: string;
  docRateToMain: number;
  docRateToSec: number;
  status: "ACTIVE" | "CANCELLED";
  createdAt: string;
  company: {
    id: string;
    name: string;
    code?: string | null;
  };
  department: {
    id: string;
    name: string;
  };
  createdBy?: TransactionUser | null;
  account: MemoOutAccount;
  inventoryItem?: InventoryItemListItem | null;
  items?: InventoryItemListItem[];
  sourceMemoOut?: MemoOutDocumentLink | null;
};

export type MemoOutPayload = {
  companyId: string;
  accountId: string;
  inventoryItemId: string;
  referenceDocNo?: string;
  paymentTerm?: number | null;
  currency?: string;
  docDate?: string;
  status?: "ACTIVE" | "CANCELLED";
};

export type MemoOutReturnPayload = {
  companyId: string;
  accountId: string;
  inventoryItemId: string;
  referenceDocNo?: string;
  docDate?: string;
};

export type MemoOutReturnItem = {
  inventoryItem: InventoryItemListItem;
  memoOut: MemoOutListItem;
};

export async function getMemoOutAccounts(
  scope: Scope,
  params: { companyId: string },
) {
  const response = await axiosInstance.get(`/api/${scope}/memo-out-accounts`, {
    params,
  });
  return response.data;
}

export async function getMemoOutInventoryItemByLot(
  scope: Scope,
  lotId: number | string,
  params: { companyId: string },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/memo-out-inventory-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function createMemoOut(scope: Scope, payload: MemoOutPayload) {
  const response = await axiosInstance.post(`/api/${scope}/memo-outs`, payload);
  return response.data;
}

export async function getMemoOutReturnItemByLot(
  scope: Scope,
  lotId: number | string,
  params: { companyId: string; accountId: string },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/memo-out-return-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function returnMemoOutItem(
  scope: Scope,
  payload: MemoOutReturnPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/memo-outs/return`,
    payload,
  );
  return response.data;
}

export async function getMemoOuts(
  scope: Scope,
  params: {
    companyId?: string;
    departmentId?: string;
    search?: string;
    docType?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/memo-outs`, {
    params,
  });
  return response.data;
}

export async function getMemoOut(
  scope: Scope,
  id: string,
  params: {
    companyId?: string;
    departmentId?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/memo-outs/${id}`, {
    params,
  });
  return response.data;
}
