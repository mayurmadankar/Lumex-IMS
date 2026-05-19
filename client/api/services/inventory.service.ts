import axiosInstance from "@/api/axios";

type Scope = "user";

export type ReturnInventoryItemsPayload = {
  departmentId: string;
  itemIds: string[];
  referenceDocNo?: string;
  docDate?: string;
};

export type InventoryPurchaseDocument = {
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

export type InventoryMemoDocument = {
  id: string;
  docId: number;
  memoNo: string;
  docType: string;
  docDate: string;
  status: "ACTIVE" | "CANCELLED";
  paymentTerm: number | null;
  currency: string;
};

export type InventoryOriginDocument =
  | (InventoryMemoDocument & { documentType: "MEMO" })
  | (InventoryPurchaseDocument & { documentType: "PURCHASE_NOTE" });

export type InventoryItemListItem = {
  id: string;
  itemId: string;
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
  shape?: string | null;
  color?: string | null;
  clarity?: string | null;
  rap?: number | null;
  mainDiscount?: number | null;
  totalDocPriceGross?: number | null;
  remark?: string | null;
  departmentAccountName: string;
  locationAccountName: string;
  status: "STOCK" | "MEMO" | "MEMO_OUT" | "SOLD" | "RETURNED";
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
  vendorAccount?: {
    id: string;
    accountName: string;
    accountIndex?: string | null;
  } | null;
  originDocument?: InventoryOriginDocument | null;
  originMemo?: InventoryMemoDocument | null;
  purchase?: InventoryPurchaseDocument | null;
  purchaseReturn?: InventoryPurchaseDocument | null;
  memoReturn?: InventoryMemoDocument | null;
  purchaseNote?: InventoryPurchaseDocument | null;
  memo?: InventoryMemoDocument | null;
};

export async function getInventoryItems(
  scope: Scope,
  params: {
    departmentId?: string;
    companyId?: string;
    search?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/inventory-items`, {
    params,
  });
  return response.data;
}

export async function getInventoryItemByLot(
  scope: Scope,
  lotId: number | string,
  params: {
    departmentId?: string;
    companyId?: string;
  },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/inventory-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function returnInventoryItems(
  scope: Scope,
  payload: ReturnInventoryItemsPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/inventory-items/return`,
    payload,
  );
  return response.data;
}
