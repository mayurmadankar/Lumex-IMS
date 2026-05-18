"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthReady } from "@/hooks/use-auth-ready";

export default function AuthGuard({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();

  const { rehydrated, isAuthenticated, user } = useAuthReady();

  useEffect(() => {
    if (!rehydrated) return;

    if (!isAuthenticated || !user) {
      router.replace("/login");
      return;
    }

    if (pathname.startsWith("/admin") && user.role !== "ORG_ADMIN") {
      router.replace("/user");
      return;
    }

    if (pathname.startsWith("/user") && user.role !== "USER") {
      router.replace("/admin");
    }
  }, [rehydrated, isAuthenticated, user, pathname, router]);

  if (!rehydrated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Restoring session...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Redirecting to login...</p>
      </div>
    );
  }

  if (pathname.startsWith("/admin") && user.role !== "ORG_ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  if (pathname.startsWith("/user") && user.role !== "USER") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <p className="text-sm text-muted-foreground">Redirecting...</p>
      </div>
    );
  }

  return <>{children}</>;
}