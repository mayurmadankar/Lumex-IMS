"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthReady } from "@/hooks/use-auth-ready";

export default function GuestGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { rehydrated, isAuthenticated, user } = useAuthReady();

  useEffect(() => {
    if (!rehydrated) return;

    if (!isAuthenticated || !user) return;

    if (user.role === "ORG_ADMIN") {
      router.replace("/admin");
      return;
    }

    router.replace("/user");
  }, [rehydrated, isAuthenticated, user, router]);

  if (!rehydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Restoring session...</p>
      </div>
    );
  }

  if (isAuthenticated && user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return <>{children}</>;
}