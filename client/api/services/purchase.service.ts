import axiosInstance from "@/api/axios";

type Scope = "user";
type PurchaseFrom = "LOCAL_PURCHASE" | "IMPORT_PURCHASE" | "INTERNAL_PURCHASE";
type ParcelOrStone = "PARCEL" | "STONE";
type DocumentStatus = "ACTIVE" | "CANCELLED";
type LotStatus = "STOCK" | "MEMO" | "SOLD" | "RETURNED";

type TransactionUser = {
  id: string;
  fullName: string;
  email: string;
};

export type PurchaseNoteItemPayload = {
  itemMasterId: string;
  lotName: string;
  quantity: number | string;
  weight: number | string;
  totalCost: number | string;
  labAccountName?: string;
  certificateNo: number | string;
  parcelOrStone: ParcelOrStone;
  remark?: string;
};

export type CreatePurchaseNotePayload = {
  purchaseFrom: PurchaseFrom;
  departmentId: string;
  vendorAccountId?: string;
  sourceCompanyId?: string;
  referenceDocNo?: string;
  paymentTerm?: number | null;
  currency?: string;
  docDate?: string;
  status?: "ACTIVE" | "CANCELLED";
  items: PurchaseNoteItemPayload[];
};

export type PurchaseSourceMemo = {
  id: string;
  docId: number;
  memoNo: string;
  docType: string;
  docDate: string;
  status: DocumentStatus;
};

export type PurchaseDocumentLink = {
  id: string;
  docId: number;
  purchaseNo: string;
  purchaseFrom: string;
  docType: string;
  docDate: string;
  status: DocumentStatus;
  paymentTerm: number | null;
  currency: string;
};

export type MemoDocumentLink = PurchaseSourceMemo & {
  paymentTerm: number | null;
  currency: string;
};

export type PurchaseOriginDocument =
  | (MemoDocumentLink & { documentType: "MEMO" })
  | (PurchaseDocumentLink & { documentType: "PURCHASE_NOTE" });

export type PurchaseNoteInventoryItem = {
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
  parcelOrStone: ParcelOrStone;
  shape?: string | null;
  color?: string | null;
  clarity?: string | null;
  rap?: number | null;
  mainDiscount?: number | null;
  totalDocPriceGross?: number | null;
  remark?: string | null;
  departmentAccountName?: string | null;
  locationAccountName?: string | null;
  status: LotStatus;
  createdAt: string;
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
  originDocument?: PurchaseOriginDocument | null;
  originMemo?: MemoDocumentLink | null;
  purchase?: PurchaseDocumentLink | null;
  purchaseReturn?: PurchaseDocumentLink | null;
  memoReturn?: MemoDocumentLink | null;
  purchaseNote?: PurchaseDocumentLink | null;
  memo?: MemoDocumentLink | null;
};

export type PurchaseNoteListItem = {
  id: string;
  docId: number;
  purchaseNo: string;
  purchaseFrom: PurchaseFrom;
  docType: string;
  openDate: string;
  docDate: string;
  referenceDocNo?: string | null;
  docQty: number;
  docWeight: number;
  docGrandTotalPrice: number;
  mainGrandTotalPrice: number;
  balanceAmount: number;
  paymentTerm: number | null;
  currency: string;
  status: DocumentStatus;
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
  vendorAccount?: {
    id: string;
    accountName: string;
    accountIndex?: string | null;
  } | null;
  sourceCompany?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  sourceMemos?: PurchaseSourceMemo[];
  items?: PurchaseNoteInventoryItem[];
};

export async function createPurchaseNote(
  scope: Scope,
  payload: CreatePurchaseNotePayload,
) {
  const response = await axiosInstance.post(`/api/${scope}/purchase-notes`, payload);
  return response.data;
}

export async function getPurchaseNotes(
  scope: Scope,
  params: {
    departmentId?: string;
    companyId?: string;
    search?: string;
    docType?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/purchase-notes`, {
    params,
  });
  return response.data;
}

export async function getPurchaseNote(
  scope: Scope,
  id: string,
  params: {
    departmentId?: string;
    companyId?: string;
    docType?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/purchase-notes/${id}`, {
    params,
  });
  return response.data;
}
