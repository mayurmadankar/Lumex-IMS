import { combineReducers, configureStore } from "@reduxjs/toolkit";
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import createWebStorage from "redux-persist/lib/storage/createWebStorage";

const createNoopStorage = () => {
  return {
    getItem(key: string) {
      void key;
      return Promise.resolve(null);
    },
    setItem(key: string, value: string) {
      void key;
      return Promise.resolve(value);
    },
    removeItem(key: string) {
      void key;
      return Promise.resolve();
    },
  };
};

const storage = typeof window !== "undefined" ? createWebStorage("local") : createNoopStorage();

import authReducer from "./slices/authSlice";
import companyReducer from "./slices/companySlice";
import permissionReducer from "./slices/permissionSlice";
import uiReducer from "./slices/uiSlice";
import workspaceReducer from "./slices/workspaceSlice";

const rootReducer = combineReducers({
  auth: authReducer,
  ui: uiReducer,
  permission: permissionReducer,
  company: companyReducer,
  workspace: workspaceReducer,
});

const persistConfig = {
  key: "ims-root",
  storage,
  whitelist: ["auth", "permission", "company", "workspace"],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
  devTools: process.env.NODE_ENV !== "production",
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
