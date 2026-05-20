import axiosInstance from "@/api/axios";
import type { InventoryItemListItem } from "@/api/services/inventory.service";

type Scope = "user";

export type ProductionStatus = "OPEN" | "CLOSED" | "CANCELLED";

export type ProductionDocument = {
  id: string;
  docId: number;
  productionNo: string;
  docType: "Change Location" | "Send To Process" | "Return Parts" | string;
  openDate: string;
  docDate: string;
  referenceDocNo?: string | null;
  notes?: string | null;
  processAccountName?: string | null;
  fromLocationAccountName?: string | null;
  toLocationAccountName?: string | null;
  expectedReturnDate?: string | null;
  docQty: number;
  docWeight: number;
  returnedQty: number;
  returnedWeight: number;
  lossWeight: number;
  docGrandTotalPrice: number;
  status: ProductionStatus;
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
  createdBy?: {
    id: string;
    fullName: string;
    email: string;
  } | null;
  sourceInventoryItem?: InventoryItemListItem | null;
  sourceProduction?: {
    id: string;
    docId: number;
    productionNo: string;
    docType: string;
    docDate: string;
    status: ProductionStatus;
  } | null;
  returnedInventoryItems?: InventoryItemListItem[];
};

export type ChangeLocationPayload = {
  companyId: string;
  inventoryItemId: string;
  toLocationAccountName: string;
  referenceDocNo?: string;
  docDate?: string;
  notes?: string;
};

export type SendToProcessPayload = {
  companyId: string;
  inventoryItemId: string;
  processAccountName: string;
  referenceDocNo?: string;
  docDate?: string;
  expectedReturnDate?: string;
  notes?: string;
};

export type ReturnProductionPartPayload = {
  itemMasterId?: string;
  lotName: string;
  quantity: number | string;
  weight: number | string;
  totalCost: number | string;
  labAccountName?: string;
  certificateNo?: string;
  parcelOrStone?: "PARCEL" | "STONE";
  shape?: string;
  color?: string;
  clarity?: string;
  rap?: number | string;
  mainDiscount?: number | string;
  remark?: string;
};

export type ReturnProductionPartsPayload = {
  companyId: string;
  inventoryItemId: string;
  sourceProductionId: string;
  returnLocationAccountName: string;
  referenceDocNo?: string;
  docDate?: string;
  notes?: string;
  lossWeight?: number | string;
  parts: ReturnProductionPartPayload[];
};

export type ProductionReturnItem = {
  inventoryItem: InventoryItemListItem;
  sourceProduction: ProductionDocument;
};

export async function getProductionInventoryItemByLot(
  scope: Scope,
  lotId: number | string,
  params: { companyId: string },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/production-inventory-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function changeInventoryLocation(
  scope: Scope,
  payload: ChangeLocationPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/production/change-location`,
    payload,
  );
  return response.data;
}

export async function sendInventoryToProcess(
  scope: Scope,
  payload: SendToProcessPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/production/send-to-process`,
    payload,
  );
  return response.data;
}

export async function getProductionReturnItemByLot(
  scope: Scope,
  lotId: number | string,
  params: { companyId: string },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/production-return-items/lot/${lotId}`,
    { params },
  );
  return response.data;
}

export async function returnProductionParts(
  scope: Scope,
  payload: ReturnProductionPartsPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/production/return-parts`,
    payload,
  );
  return response.data;
}

export async function getProductionDocuments(
  scope: Scope,
  params: {
    companyId?: string;
    departmentId?: string;
    search?: string;
    docType?: string;
  },
) {
  const response = await axiosInstance.get(
    `/api/${scope}/production-documents`,
    { params },
  );
  return response.data;
}
