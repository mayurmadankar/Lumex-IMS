import { createSlice } from "@reduxjs/toolkit";

// interface UiState {
//   sidebarOpen: boolean;
//   pageLoading: boolean;
//   globalModalOpen: boolean;
// }

const initialState = {
  sidebarOpen: true,
  pageLoading: false,
//   globalModalOpen: false,
};

const uiSlice = createSlice({
  name: "ui",
  initialState,
  reducers: {
    // setSidebarOpen: (state, action) => {
    //   state.sidebarOpen = action.payload;
    // },
    toggleSidebar: (state) => {
      state.sidebarOpen = !state.sidebarOpen;
    },
    setPageLoading: (state, action) => {
      state.pageLoading = action.payload;
    },
    // setGlobalModalOpen: (state, action) => {
    //   state.globalModalOpen = action.payload;
    // },
  },
});

export const {toggleSidebar,setPageLoading} = uiSlice.actions;

export default uiSlice.reducer;
