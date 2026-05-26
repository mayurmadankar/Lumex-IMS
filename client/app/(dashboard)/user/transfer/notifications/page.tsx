"use client";

import { Bell, Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "@/api/services/transfer-request.service";
import type { TransferNotification } from "@/api/services/transfer-request.service";
import { Button } from "@/components/ui/button";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export default function TransferNotificationsPage() {
  const [notifications, setNotifications] = useState<TransferNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadNotifications = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await getNotifications("user");
        if (!cancelled) {
          const loadedNotifications = response.data.notifications ?? [];
          const loadedUnreadCount = response.data.unreadCount ?? 0;
          setNotifications(loadedNotifications);
          setUnreadCount(loadedUnreadCount);

          if (loadedUnreadCount > 0) {
            markNotificationsRead("user")
              .then(() => {
                if (cancelled) return;
                const readAt = new Date().toISOString();
                setNotifications((items) =>
                  items.map((item) =>
                    item.readAt ? item : { ...item, readAt },
                  ),
                );
                setUnreadCount(0);
              })
              .catch(() => undefined);
          }
        }
      } catch {
        if (!cancelled) setError("Failed to load notifications.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadNotifications();

    return () => {
      cancelled = true;
    };
  }, []);

  const filteredNotifications = useMemo(() => {
    const value = search.trim();
    if (!value) return notifications;

    return notifications.filter((notification) =>
      matchesTableSearch(
        [
          notification.title,
          notification.message,
          notification.type,
          notification.company?.name,
          notification.actorUser?.fullName,
          notification.transferRequest?.requestNo,
          notification.transferRequest?.sourceCompany.name,
          notification.transferRequest?.requesterCompany.name,
        ],
        value,
      ),
    );
  }, [notifications, search]);

  const { paginatedItems, ...pagination } = usePagination(filteredNotifications);

  const handleMarkRead = async (notification: TransferNotification) => {
    try {
      setMarkingId(notification.id);
      await markNotificationRead("user", notification.id);
      setNotifications((items) =>
        items.map((item) =>
          item.id === notification.id
            ? { ...item, readAt: new Date().toISOString() }
            : item,
        ),
      );
      setUnreadCount((count) => Math.max(0, count - 1));
      toast.success("Notification marked as read.");
    } catch (error: unknown) {
      const apiError = error as {
        response?: { data?: { message?: string } };
      };
      toast.error(
        apiError.response?.data?.message ?? "Failed to mark notification read.",
      );
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className="min-h-screen bg-muted/30 p-4 sm:p-6">
      <div className="mx-auto w-full max-w-none space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Transfer
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount} unread transfer notification
              {unreadCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="inline-flex w-fit items-center gap-2 rounded-xl border bg-background px-3 py-2 text-sm font-medium">
            <Bell className="h-4 w-4 text-muted-foreground" />
            {filteredNotifications.length} notifications
          </div>
        </div>

        <TableSearchBar
          search={search}
          onSearch={setSearch}
          placeholder="Search notifications"
        />

        {loading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border bg-background text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Loading notifications...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-6 py-8 text-center text-sm text-destructive">
            {error}
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
            No notifications found.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border bg-background">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] text-[13px]">
                <thead>
                  <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                    <th className="px-3 py-3 font-medium">Status</th>
                    <th className="px-3 py-3 font-medium">Title</th>
                    <th className="px-3 py-3 font-medium">Message</th>
                    <th className="px-3 py-3 font-medium">Company</th>
                    <th className="px-3 py-3 font-medium">Request No</th>
                    <th className="px-3 py-3 font-medium">From</th>
                    <th className="px-3 py-3 font-medium">Created At</th>
                    <th className="px-3 py-3 text-right font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedItems.map((notification) => (
                    <tr
                      key={notification.id}
                      className={`border-b last:border-0 hover:bg-muted/20 ${
                        notification.readAt ? "" : "bg-primary/[0.03]"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ${
                            notification.readAt
                              ? "bg-slate-50 text-slate-600 ring-slate-200"
                              : "bg-emerald-50 text-emerald-700 ring-emerald-200"
                          }`}
                        >
                          {notification.readAt ? "READ" : "UNREAD"}
                        </span>
                      </td>
                      <td className="px-3 py-3 font-semibold">
                        {notification.title}
                      </td>
                      <td className="px-3 py-3">{notification.message}</td>
                      <td className="px-3 py-3">
                        {notification.company?.name ?? "-"}
                      </td>
                      <td className="px-3 py-3 font-medium text-blue-600">
                        {notification.transferRequest?.requestNo ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {notification.actorUser?.fullName ?? "-"}
                      </td>
                      <td className="px-3 py-3">
                        {formatDate(notification.createdAt)}
                      </td>
                      <td className="px-3 py-3 text-right">
                        {notification.readAt ? (
                          "-"
                        ) : (
                          <Button
                            variant="outline"
                            className="h-8 rounded-xl"
                            disabled={markingId === notification.id}
                            onClick={() => handleMarkRead(notification)}
                          >
                            {markingId === notification.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            Mark Read
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              start={pagination.start}
              end={pagination.end}
              total={pagination.total}
              onPageChange={pagination.setPage}
            />
          </div>
        )}
      </div>
    </div>
  );
}
