import axiosInstance from "@/api/axios";

type Scope = "user";

export type InvoiceType =
  | "LOCAL_INVOICE"
  | "EXPORT_INVOICE"
  | "INTERNAL_INVOICE";

export type InvoiceStatus = "ACTIVE" | "PENDING" | "DRAFT" | "CANCELLED";

export type CreateInvoicePayload = {
  departmentId: string;
  accountId?: string;
  sourceCompanyId?: string;
  destinationDepartmentId?: string;
  referenceDocNo: string;
  invoiceType: InvoiceType;
  docDate?: string;
  currency?: string;
  status?: InvoiceStatus;
  remark?: string;
  item: {
    lotId?: number | string;
    itemName: string;
    itemDescription?: string;
    quantity: number | string;
    unitPrice: number | string;
  };
};

export type CreateInvoiceFromInventoryPayload = {
  departmentId: string;
  inventoryItemId: string;
  accountId?: string;
  sourceCompanyId?: string;
  destinationDepartmentId?: string;
  referenceDocNo: string;
  invoiceType: InvoiceType;
  docDate?: string;
  currency?: string;
  status?: InvoiceStatus;
  remark?: string;
};

export type InvoiceItem = {
  id: string;
  inventoryItemId?: string | null;
  itemMasterId?: string | null;
  itemId?: string | null;
  lotId?: number | null;
  itemName: string;
  itemDescription?: string | null;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  weight: number;
  labAccountName?: string | null;
  certificateNo?: string | null;
  parcelOrStone?: "PARCEL" | "STONE" | null;
  remark?: string | null;
  itemMaster?: {
    id: string;
    itemId: number;
    itemName: string;
    itemType: string;
    uow: "CARATS" | "GRAMS";
    uom: "PCS" | "WEIGHT";
  } | null;
  inventoryItem?: {
    id: string;
    itemId: string;
    lotId: number;
    lotName: string;
    status: "STOCK" | "MEMO" | "SOLD" | "RETURNED";
    purchaseNote?: {
      id: string;
      docId: number;
      purchaseNo: string;
      docType: string;
    } | null;
    memo?: {
      id: string;
      docId: number;
      memoNo: string;
      docType: string;
    } | null;
  } | null;
  sourceDocId?: number | null;
  sourceDocNo?: string | null;
  sourceDocType?: string | null;
};

export type InvoiceListItem = {
  id: string;
  docId: number;
  invoiceNo: string;
  docType: string;
  invoiceType: InvoiceType;
  invoiceTypeLabel: string;
  openDate: string;
  docDate: string;
  referenceDocNo: string;
  docQty: number;
  docWeight: number;
  subtotalAmount: number;
  totalAmount: number;
  balanceAmount: number;
  currency: string;
  notes?: string | null;
  status: InvoiceStatus;
  createdAt: string;
  company: {
    id: string;
    name: string;
    code?: string | null;
  };
  sourceCompany?: {
    id: string;
    name: string;
    code?: string | null;
    status?: "ACTIVE" | "INACTIVE";
  } | null;
  department: {
    id: string;
    name: string;
  };
  account?: {
    id: string;
    accountName: string;
    accountIndex?: string | null;
    address?: string | null;
    countryIso2?: string | null;
    city?: string | null;
    phone1?: string | null;
    email?: string | null;
    trnNo?: string | null;
    state?: {
      id: string;
      name: string;
      code: string;
    } | null;
  } | null;
  items?: InvoiceItem[];
  lotId?: number | null;
  sourceDocId?: number | null;
  sourceDocNo?: string | null;
  sourceDocType?: string | null;
  itemName?: string;
  itemDescription?: string | null;
  quantity?: number;
  unitPrice?: number;
};

export async function createInvoice(scope: Scope, payload: CreateInvoicePayload) {
  const response = await axiosInstance.post(`/api/${scope}/invoices`, payload);
  return response.data;
}

export async function createInvoiceFromInventory(
  scope: Scope,
  payload: CreateInvoiceFromInventoryPayload,
) {
  const response = await axiosInstance.post(
    `/api/${scope}/invoices/from-inventory`,
    payload,
  );
  return response.data;
}

export async function getInvoices(
  scope: Scope,
  params: {
    departmentId: string;
    search?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/invoices`, {
    params,
  });
  return response.data;
}

export async function getInvoice(
  scope: Scope,
  id: string,
  params: {
    departmentId: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/invoices/${id}`, {
    params,
  });
  return response.data;
}
