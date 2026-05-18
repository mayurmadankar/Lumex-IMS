"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { persistor } from "@/store";
import { useAppDispatch } from "@/store/hooks";
import { clearSession } from "@/store/slices/authSlice";
import { clearCompanyState } from "@/store/slices/companySlice";
import { clearPermissions } from "@/store/slices/permissionSlice";
import { resetWorkspace } from "@/store/slices/workspaceSlice";


export default function LogoutButton() {
  const router = useRouter();
  const dispatch = useAppDispatch();

  const handleLogout = async () => {
    dispatch(clearSession());
    dispatch(clearCompanyState());
    dispatch(clearPermissions());
    dispatch(resetWorkspace());
    await persistor.purge();
    router.replace("/login");
  };

  return (
    <button onClick={handleLogout} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition">
      <LogOut className="h-4 w-4" />
      Logout
    </button>
  );
}