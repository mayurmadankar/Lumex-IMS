import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { PermissionMap } from "../types/types";

interface PermissionState {
  permissions: PermissionMap;
}

const initialState: PermissionState = {
  permissions: {},
};

const permissionSlice = createSlice({
  name: "permission",
  initialState,
  reducers: {
    setPermissions: (state, action: PayloadAction<PermissionMap>) => {
      state.permissions = action.payload;
    },

    updateSinglePermission: (
      state,
      action: PayloadAction<{
        module: keyof PermissionMap;
        access: PermissionMap[keyof PermissionMap];
      }>
    ) => {
      const { module, access } = action.payload;

      if (!access) {
        delete state.permissions[module];
        return;
      }

      state.permissions[module] = access;
    },

    clearPermissions: (state) => {
      state.permissions = {};
    },
  },
});

export const {
  setPermissions,
  updateSinglePermission,
  clearPermissions,
} = permissionSlice.actions;

export default permissionSlice.reducer;