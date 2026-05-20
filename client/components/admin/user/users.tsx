"use client";

import { Plus, Loader2, Eye, Pencil } from "lucide-react";
import Link from "next/link";
import { useState, useEffect, useMemo } from "react";

import { AddUserModal, EditUserModal } from "./userFormModal";

import { getUsers } from "@/api/services/user.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";

type User = {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  createdAt: string;
  company: { id: string; name: string } | null;
  _count: { departmentAccesses: number };
  departmentAccesses: {
    department: {
      id: string;
      name: string;
      company: { id: string; name: string };
    };
  }[];
};

// ── Main View ─────────────────────────────────────────────────────────────────
export default function UsersView() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await getUsers();
        setUsers(res.data.users);
      } catch {
        setError("Failed to load users");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handleCreated = (user: User) => {
    setUsers((prev) => [user, ...prev]);
    setModalOpen(false);
  };

  const handleUpdated = (updated: User) => {
    setUsers((prev) =>
      prev.map((u) => (u.id === updated.id ? { ...u, ...updated } : u)),
    );
    setEditUser(null);
  };
  const filteredUsers = useMemo(() => {
    const value = search.trim();
    if (!value) return users;

    return users.filter((user) =>
      matchesTableSearch(
        [
          user.fullName,
          user.email,
          user.company?.name,
          user._count?.departmentAccesses,
          user.isActive ? "Active" : "Inactive",
          ...user.departmentAccesses.map((access) => access.department.name),
          ...user.departmentAccesses.map(
            (access) => access.department.company.name,
          ),
        ],
        value,
      ),
    );
  }, [search, users]);
  const { paginatedItems: paginatedUsers, ...userPagination } =
    usePagination(filteredUsers);

  return (
    <>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="text-sm text-muted-foreground">
            Create and manage users with department access.
          </p>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>User List</CardTitle>
            <Button className="rounded-xl" onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            <TableSearchBar
              search={search}
              onSearch={setSearch}
              placeholder="Search users"
            />
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading users...
              </div>
            ) : error ? (
              <div className="py-12 text-center text-sm text-destructive">
                {error}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No users found.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-150 text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-3 font-medium">Name</th>
                        <th className="py-3 font-medium">Email</th>
                        <th className="py-3 font-medium">Primary Company</th>
                        <th className="py-3 font-medium">Departments</th>
                        <th className="py-3 font-medium">Status</th>
                        <th className="py-3 font-medium">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.map((user) => (
                        <tr key={user.id} className="border-b last:border-0">
                          <td className="py-4 font-medium">{user.fullName}</td>
                          <td className="py-4 text-muted-foreground">
                            {user.email}
                          </td>
                          <td className="py-4">
                            {user.company ? (
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                                {user.company.name}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="py-4">
                            {user._count?.departmentAccesses}
                          </td>
                          <td className="py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}
                            >
                              {user.isActive ? "Active" : "Inactive"}
                            </span>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2">
                              <Link
                                href={`/admin/users/${user.id}`}
                                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </Link>
                              <button
                                onClick={() => setEditUser(user)}
                                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                                Edit
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <Pagination
                  page={userPagination.page}
                  totalPages={userPagination.totalPages}
                  start={userPagination.start}
                  end={userPagination.end}
                  total={userPagination.total}
                  onPageChange={userPagination.setPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
      <EditUserModal
        user={editUser}
        onClose={() => setEditUser(null)}
        onUpdated={handleUpdated}
      />
    </>
  );
}
