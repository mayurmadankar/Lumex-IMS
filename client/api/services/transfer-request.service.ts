import axiosInstance from "@/api/axios";
import type { InventoryItemListItem } from "@/api/services/inventory.service";
import type {
  TransferDepartment,
  TransferDepartmentUser,
} from "@/api/services/transfer.service";

type Scope = "user";

export type TransferRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "TRANSFERRED"
  | "CANCELLED";

export type TransferRequestItem = {
  id: string;
  requestNo: string;
  status: TransferRequestStatus;
  requestNote?: string | null;
  responseNote?: string | null;
  createdAt: string;
  updatedAt: string;
  inventoryItem?: InventoryItemListItem | null;
  sourceCompany: {
    id: string;
    name: string;
    code?: string | null;
  };
  sourceDepartment: TransferDepartment;
  requesterCompany: {
    id: string;
    name: string;
    code?: string | null;
  };
  requesterDepartment: TransferDepartment;
  requesterUser: TransferDepartmentUser;
  approvedBy?: TransferDepartmentUser | null;
  transfer?: {
    id: string;
    docId: number;
    transferNo: string;
    docDate: string;
    createdAt: string;
  } | null;
};

export type TransferNotification = {
  id: string;
  type:
    | "TRANSFER_REQUEST_CREATED"
    | "TRANSFER_REQUEST_APPROVED"
    | "TRANSFER_REQUEST_REJECTED"
    | "TRANSFER_REQUEST_TRANSFERRED";
  title: string;
  message: string;
  readAt?: string | null;
  createdAt: string;
  actorUser?: TransferDepartmentUser | null;
  company?: {
    id: string;
    name: string;
    code?: string | null;
  } | null;
  transferRequest?: TransferRequestItem | null;
};

export async function getCrossCompanyInventory(
  scope: Scope,
  params: { search?: string; includeOwn?: boolean } = {},
) {
  const response = await axiosInstance.get(
    `/api/${scope}/cross-company-inventory`,
    { params },
  );
  return response.data;
}

export async function createTransferRequest(
  scope: Scope,
  payload: {
    inventoryItemId: string;
    requesterCompanyId: string;
    requesterDepartmentId: string;
    requestNote?: string;
  },
) {
  const response = await axiosInstance.post(
    `/api/${scope}/transfer-requests`,
    payload,
  );
  return response.data;
}

export async function getTransferRequests(
  scope: Scope,
  params: { status?: TransferRequestStatus } = {},
) {
  const response = await axiosInstance.get(`/api/${scope}/transfer-requests`, {
    params,
  });
  return response.data;
}

export async function getIncomingTransferRequests(
  scope: Scope,
  params: { status?: TransferRequestStatus } = {},
) {
  const response = await axiosInstance.get(
    `/api/${scope}/transfer-requests/incoming`,
    { params },
  );
  return response.data;
}

export async function getOutgoingTransferRequests(
  scope: Scope,
  params: { status?: TransferRequestStatus } = {},
) {
  const response = await axiosInstance.get(
    `/api/${scope}/transfer-requests/outgoing`,
    { params },
  );
  return response.data;
}

export async function approveTransferRequest(
  scope: Scope,
  id: string,
  payload: { invoiceNo: string; responseNote?: string },
) {
  const response = await axiosInstance.post(
    `/api/${scope}/transfer-requests/${id}/approve`,
    payload,
  );
  return response.data;
}

export async function rejectTransferRequest(
  scope: Scope,
  id: string,
  payload: { responseNote?: string } = {},
) {
  const response = await axiosInstance.post(
    `/api/${scope}/transfer-requests/${id}/reject`,
    payload,
  );
  return response.data;
}

export async function getNotifications(
  scope: Scope,
  params: { unreadOnly?: boolean } = {},
) {
  const response = await axiosInstance.get(`/api/${scope}/notifications`, {
    params,
  });
  return response.data;
}

export async function markNotificationRead(scope: Scope, id: string) {
  const response = await axiosInstance.patch(
    `/api/${scope}/notifications/${id}/read`,
  );
  return response.data;
}

export async function markNotificationsRead(scope: Scope) {
  const response = await axiosInstance.patch(
    `/api/${scope}/notifications/read`,
  );
  return response.data;
}
