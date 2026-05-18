import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface WorkspaceTab {
  id: string;
  key: string
  title: string;
  closable: boolean;
  props?: Record<string, unknown>;
}

interface WorkspaceState {
  openTabs: WorkspaceTab[];
  activeTabId: string | null;
}

const initialState: WorkspaceState = {
  openTabs: [
    {
      id: "dashboard",
      key: "dashboard",
      title: "Company View",
      closable: false,
    },
  ],
  activeTabId: "dashboard",
};

type OpenTabPayload = {
  key: string;
  title: string;
  closable?: boolean;
  props?: Record<string, unknown>;
  forceNew?: boolean; // if true, always open a new tab instance
};

const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    openTab: (state, action: PayloadAction<OpenTabPayload>) => {
      const { key, title, closable = true, props = {}, forceNew = false } = action.payload;

      if (!forceNew) {
        const existingTab = state.openTabs.find((tab) => tab.key === key && !forceNew);
        if (existingTab) {
          state.activeTabId = existingTab.id;
          return;
        }
      }

      const newTabId = `${key}__${Date.now()}`;

      state.openTabs.push({
        id: newTabId,
        key,
        title,
        closable,
        props,
      });

      state.activeTabId = newTabId;
    },

    setActiveTab: (state, action: PayloadAction<string>) => {
      const exists = state.openTabs.some((tab) => tab.id === action.payload);
      if (exists) {
        state.activeTabId = action.payload;
      }
    },

    closeTab: (state, action: PayloadAction<string>) => {
      const tabId = action.payload;

      const tabIndex = state.openTabs.findIndex((tab) => tab.id === tabId);
      if (tabIndex === -1) return;

      const tabToClose = state.openTabs[tabIndex];
      if (!tabToClose.closable) return;

      const wasActive = state.activeTabId === tabId;

      state.openTabs = state.openTabs.filter((tab) => tab.id !== tabId);

      if (!state.openTabs.length) {
        state.openTabs = [
          {
            id: "dashboard",
            key: "dashboard",
            title: "Company View",
            closable: false,
          },
        ];
        state.activeTabId = "dashboard";
        return;
      }

      if (wasActive) {
        const fallbackTab = state.openTabs[tabIndex - 1] || state.openTabs[tabIndex] || state.openTabs[0];

        state.activeTabId = fallbackTab.id;
      }
    },

    closeOtherTabs: (state, action: PayloadAction<string>) => {
      const keepTabId = action.payload;
      const keepTab = state.openTabs.find((tab) => tab.id === keepTabId);
      if (!keepTab) return;

      state.openTabs = state.openTabs.filter((tab) => !tab.closable || tab.id === keepTabId);

      state.activeTabId = keepTabId;
    },

    closeAllClosableTabs: (state) => {
      state.openTabs = state.openTabs.filter((tab) => !tab.closable);

      if (!state.openTabs.length) {
        state.openTabs = [
          {
            id: "dashboard",
            key: "dashboard",
            title: "Company View",
            closable: false,
          },
        ];
      }

      state.activeTabId = state.openTabs[0]?.id ?? null;
    },

    updateTabTitle: (state, action: PayloadAction<{ id: string; title: string }>) => {
      const tab = state.openTabs.find((t) => t.id === action.payload.id);
      if (tab) {
        tab.title = action.payload.title;
      }
    },

    resetWorkspace: () => initialState,
  },
});

export const { openTab, setActiveTab, closeTab, closeOtherTabs, closeAllClosableTabs, updateTabTitle, resetWorkspace } = workspaceSlice.actions;

export default workspaceSlice.reducer;
