import axiosInstance from "@/api/axios";
import type { LotStatus } from "@/api/services/inventory.service";

type Scope = "user";

type TransactionUser = {
  id: string;
  fullName: string;
  email: string;
};

export type MemoItemPayload = {
  itemMasterId: string;
  lotName: string;
  quantity: number | string;
  weight: number | string;
  totalCost: number | string;
  labAccountName?: string;
  certificateNo: number | string;
  parcelOrStone?: "PARCEL" | "STONE";
  remark?: string;
};

export type MemoPayload = {
  departmentId: string;
  accountId: string;
  referenceDocNo?: string;
  itemType?: string;
  paymentTerm?: number | null;
  currency?: string;
  docDate?: string;
  status?: "ACTIVE" | "CANCELLED";
  items: MemoItemPayload[];
};

export type PurchaseMemoInventoryItemsPayload = {
  departmentId: string;
  itemIds: string[];
  referenceDocNo?: string;
  paymentTerm?: number | null;
  currency?: string;
  docDate?: string;
  status?: "ACTIVE" | "CANCELLED";
  remark?: string;
};

export type ReturnMemoInventoryItemsPayload = {
  departmentId: string;
  itemIds: string[];
  referenceDocNo?: string;
  docDate?: string;
};

export type MemoListItem = {
  id: string;
  docId: number;
  memoNo: string;
  docType: string;
  vendorDocId?: string | null;
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
  account: {
    id: string;
    accountName: string;
    accountIndex?: string | null;
    address?: string | null;
    countryIso2?: string | null;
    state?: {
      id: string;
      name: string;
      code: string;
    } | null;
    city?: string | null;
    phone1?: string | null;
    trnNo?: string | null;
  };
  items?: MemoInventoryItem[];
};

export type MemoPurchaseDocument = {
  id: string;
  docId: number;
  purchaseNo: string;
  purchaseFrom: string;
  docType: string;
  docDate: string;
  status: "ACTIVE" | "CANCELLED";
  paymentTerm: number | null;
  currency: string;
};

export type MemoDocumentLink = {
  id: string;
  docId: number;
  memoNo: string;
  docType: string;
  docDate: string;
  status: "ACTIVE" | "CANCELLED";
  paymentTerm: number | null;
  currency: string;
};

export type MemoOriginDocument =
  | (MemoDocumentLink & { documentType: "MEMO" })
  | (MemoPurchaseDocument & { documentType: "PURCHASE_NOTE" });

export type MemoInventoryItem = {
  id: string;
  itemId: string;
  docId: number;
  lotId: number;
  itemType?: string;
  itemMaster?: {
    id: string;
    itemId: number;
    itemName: string;
    itemType: string;
    uow: "CARATS" | "GRAMS";
    uom: "PCS" | "WEIGHT";
  } | null;
  lotName: string;
  quantity: number;
  weight: number;
  totalCost: number;
  labAccountName: string;
  certificateNo: string;
  parcelOrStone: "PARCEL" | "STONE";
  departmentAccountName?: string | null;
  locationAccountName?: string | null;
  status: LotStatus;
  createdAt: string;
  shape?: string | null;
  color?: string | null;
  clarity?: string | null;
  rap?: number | null;
  mainDiscount?: number | null;
  totalDocPriceGross?: number | null;
  remark?: string | null;
  company?: {
    id: string;
    name: string;
    code?: string | null;
  };
  department?: {
    id: string;
    name: string;
  };
  vendorAccount?: {
    id: string;
    accountName: string;
    accountIndex?: string | null;
  } | null;
  originDocument?: MemoOriginDocument | null;
  originMemo?: MemoDocumentLink | null;
  purchase?: MemoPurchaseDocument | null;
  purchaseReturn?: MemoPurchaseDocument | null;
  memoReturn?: MemoDocumentLink | null;
  purchaseNote?: MemoPurchaseDocument | null;
  memo?: MemoDocumentLink | null;
};

export async function createMemo(scope: Scope, payload: MemoPayload) {
  const response = await axiosInstance.post(`/api/${scope}/memos`, payload);
  return response.data;
}

export async function getMemos(
  scope: Scope,
  params: {
    departmentId?: string;
    companyId?: string;
    search?: string;
    docType?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/memos`, { params });
  return response.data;
}

export async function getMemo(
  scope: Scope,
  id: string,
  params: {
    departmentId?: string;
    companyId?: string;
    docType?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/memos/${id}`, {
    params,
  });
  return response.data;
}

export async function deleteMemo(
  scope: Scope,
  id: string,
  params: {
    departmentId: string;
  },
) {
  const response = await axiosInstance.delete(`/api/${scope}/memos/${id}`, {
    params,
  });
  return response.data;
}

export async function getMemoInventoryItems(
  scope: Scope,
  params: {
    departmentId: string;
    search?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/memo-inventory-items`, {
    params,
  });
  return response.data;
}

export async function getMemoInventoryItemByLot(
  scope: Scope,
  lotId: number | string,
  params: {
    departmentId?: string;
    companyId?: string;
  },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/memo-inventory-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function purchaseMemoInventoryItems(
  scope: Scope,
  payload: PurchaseMemoInventoryItemsPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/memo-inventory-items/purchase`,
    payload,
  );
  return response.data;
}

export async function returnMemoInventoryItems(
  scope: Scope,
  payload: ReturnMemoInventoryItemsPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/memo-inventory-items/return`,
    payload,
  );
  return response.data;
}
