"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthReady } from "@/hooks/use-auth-ready";

export default function HomePage() {
  const router = useRouter();
  const { rehydrated, isAuthenticated, user } = useAuthReady();

  useEffect(() => {
    if (!rehydrated) return;

    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }

    if (user.role === "ORG_ADMIN") {
      router.replace("/admin");
      return;
    }

    router.replace("/user");
  }, [rehydrated, isAuthenticated, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30">
      <p className="text-sm text-muted-foreground">
        {!rehydrated ? "Restoring session..." : "Redirecting..."}
      </p>
    </div>
  );
}