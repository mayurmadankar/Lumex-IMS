"use client";

import { useAppSelector } from "@/store/hooks";

export function useAuthReady() {
  const rehydrated = useAppSelector(
    (state) => state._persist?.rehydrated ?? false
  );

  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const user = useAppSelector((state) => state.auth.user);

  return {
    rehydrated,
    isAuthenticated,
    user,
  };
}