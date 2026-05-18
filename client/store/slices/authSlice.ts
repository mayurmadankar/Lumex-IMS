import { createSlice } from "@reduxjs/toolkit";

import type {
  DepartmentAccessOption,
  PermissionMap,
  UserRole,
} from "../types/types";

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  orgId?: string;
  primaryCompanyId: string | null;
  companyId: string | null;
  role: UserRole;
  accessibleCompanyIds: string[];
  selectedCompanyId: string | null;
  selectedDepartmentId: string | null;
  permissions: PermissionMap;
  departmentAccesses: DepartmentAccessOption[];
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: CurrentUser | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  user: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setSession: ( state, action ) => {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.user = action.payload.user;
      state.isAuthenticated = true;
    },

    updateUser: (state, action ) => {
      state.user = action.payload;
      state.isAuthenticated = true;
    },

    clearSession: (state) => {
      state.accessToken = null;
      state.refreshToken = null;
      state.user = null;
      state.isAuthenticated = false;
    },

    setSelectedCompanyInAuth: (
      state,
      action,
    ) => {
      if (state.user) {
        state.user.selectedCompanyId = action.payload;
      }
    },

    setSelectedDepartmentInAuth: (state, action) => {
      if (state.user) {
        state.user.selectedDepartmentId = action.payload;
      }
    },
  },
});

export const {
  setSession,
  updateUser,
  clearSession,
  setSelectedCompanyInAuth,
  setSelectedDepartmentInAuth,
} = authSlice.actions;
export default authSlice.reducer;
