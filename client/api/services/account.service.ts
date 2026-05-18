import axiosInstance from "@/api/axios";

type Scope = "admin" | "user";

export type AccountPayload = {
  accountTypeId: string;
  accountName: string;
  accountLongName?: string;
  status?: string;
  closeDate?: string;
  closeReason?: string;
  address?: string;
  address2?: string;
  countryIso2?: string;
  stateId?: string;
  city?: string;
  zipCode?: string;
  phone1?: string;
  phone2?: string;
  email?: string;
  website?: string;
  trnNo?: string;
  isTaxable?: boolean;
  departmentId?: string;
  companyId?: string;
};

export type AccountListItem = {
  id: string;
  accountName: string;
  accountLongName?: string | null;
  accountIndex?: string | null;
  status: "ACTIVE" | "INACTIVE" | "PENDING" | "CLOSED";
  address?: string | null;
  address2?: string | null;
  countryIso2?: string | null;
  stateId?: string | null;
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
  createdAt: string;
  accountType: {
    id: string;
    name: string;
  };
  company: {
    id: string;
    name: string;
    code?: string | null;
  };
  originDepartment?: {
    id: string;
    name: string;
  } | null;
  createdBy: {
    id: string;
    fullName: string;
    email: string;
  };
};

export async function createAccount(scope: Scope, payload: AccountPayload) {
  const response = await axiosInstance.post(`/api/${scope}/accounts`, payload);
  return response.data;
}

export async function getAccounts(
  scope: Scope,
  params: {
    accountTypeId?: string;
    companyId?: string;
    departmentId?: string;
    search?: string;
    status?: string;
  },
) {
  const response = await axiosInstance.get(`/api/${scope}/accounts`, { params });
  return response.data;
}
