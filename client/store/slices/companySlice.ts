import { createSlice, PayloadAction } from "@reduxjs/toolkit";

import type { CompanyOption } from "../types/types";

interface CompanyState {
  accessibleCompanies: CompanyOption[];
  selectedCompanyId: string | null;
}

const initialState: CompanyState = {
  accessibleCompanies: [],
  selectedCompanyId: null,
};

const companySlice = createSlice({
  name: "company",
  initialState,
  reducers: {
    setAccessibleCompanies: (state, action: PayloadAction<CompanyOption[]>) => {
      state.accessibleCompanies = action.payload;
    },

    setSelectedCompanyId: (state, action: PayloadAction<string | null>) => {
      state.selectedCompanyId = action.payload;
    },

    clearCompanyState: (state) => {
      state.accessibleCompanies = [];
      state.selectedCompanyId = null;
    },
  },
});

export const {
  setAccessibleCompanies,
  setSelectedCompanyId,
  clearCompanyState,
} = companySlice.actions;

export default companySlice.reducer;