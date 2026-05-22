"use client";

import { Mail, Building2, Users, Shield, Loader2, LayoutGrid, Pencil, X, Check, Plus, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import { getCompanies } from "@/api/services/company.service";
import { getUser, updateDepartmentPermissions, addUserDepartment, removeUserDepartment } from "@/api/services/user.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import Pagination from "@/components/ui/pagination";
import { buildDefaultPermissions, normalizePermissions } from "@/config/modules";
import type { ModuleKey } from "@/config/modules";
import { usePagination } from "@/hooks/use-pagination";

// ── Types ─────────────────────────────────────────────────────────────────────
type PermissionValue = "READ_ONLY" | "READ_WRITE" | "NONE";
type ModulePermission = { module: ModuleKey; permission: PermissionValue };
type DepartmentAccess = {
  id: string;
  permissions: ModulePermission[];
  department: { id: string; name: string; country: string; company: { id: string; name: string } };
};
type User = {
  id: string;
  fullName: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  company: { id: string; name: string } | null;
  departmentAccesses: DepartmentAccess[];
  _count: { departmentAccesses: number };
};
type Department = { id: string; name: string; country: string };
type Company = { id: string; name: string; departments: Department[] };

const parsePermissions = (raw: unknown): ModulePermission[] => {
  const normalized = normalizePermissions(raw);
  return normalized.length ? normalized : buildDefaultPermissions();
};

const buildPermissionsWithLevel = (permission: PermissionValue): ModulePermission[] =>
  buildDefaultPermissions().map((item) => ({ ...item, permission }));

function InfoItem({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-muted/40">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}

function PermissionBadge({ permission }: { permission: PermissionValue }) {
  if (permission === "READ_WRITE") return <span className="rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">Read write</span>;
  if (permission === "READ_ONLY") return <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">Read only</span>;
  return <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">None</span>;
}

function PermissionToggle({ value, onChange }: { value: PermissionValue; onChange: (val: PermissionValue) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border text-xs font-medium">
      {(["NONE", "READ_ONLY", "READ_WRITE"] as PermissionValue[]).map((opt) => (
        <button
          key={opt}
          type="button"
          onClick={() => onChange(opt)}
          className={`border-r px-2.5 py-1.5 whitespace-nowrap transition last:border-r-0 ${value === opt ? (opt === "NONE" ? "bg-muted text-muted-foreground" : opt === "READ_ONLY" ? "bg-blue-50 text-blue-700" : "bg-green-50 text-green-700") : "hover:bg-muted"}`}>
          {opt === "NONE" ? "None" : opt === "READ_ONLY" ? "Read" : "Read write"}
        </button>
      ))}
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  onConfirm,
  onCancel,
  isLoading,
  confirmLabel = "Confirm",
  confirmVariant = "default",
}: {
  open: boolean;
  title: string;
  description: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
  confirmLabel?: string;
  confirmVariant?: "default" | "destructive";
}) {
  return (
    <Modal open={open} onClose={onCancel} title={title} maxWidth="sm">
      <ModalBody>
        <p className="text-sm text-muted-foreground">{description}</p>
      </ModalBody>
      <ModalFooter>
        <Button variant="outline" className="rounded-xl" onClick={onCancel} disabled={isLoading}>
          Cancel
        </Button>
        <Button variant={confirmVariant} className="rounded-xl" onClick={onConfirm} disabled={isLoading}>
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Please wait...
            </>
          ) : (
            confirmLabel
          )}
        </Button>
      </ModalFooter>
    </Modal>
  );
}

function DepartmentPermissionCard({ access, onSaved, onRemove }: { access: DepartmentAccess; onSaved: (accessId: string, permissions: ModulePermission[]) => void; onRemove: (departmentId: string) => void }) {
  const safePermissions = parsePermissions(access.permissions);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState(safePermissions);
  const [bulkPermission, setBulkPermission] = useState<PermissionValue>("READ_ONLY");

  useEffect(() => {
    setDraft(parsePermissions(access.permissions));
  }, [access.permissions]);

  const applyBulkPermission = () => {
    setDraft((prev) =>
      prev.map((permission) => ({
        ...permission,
        permission: bulkPermission,
      })),
    );
  };

  const handleSave = async () => {
    try {
      setIsSaving(true);
      await updateDepartmentPermissions(access.id, draft);
      onSaved(access.id, draft);
      setIsEditing(false);
      toast.success("Permissions updated");
    } catch {
      toast.error("Failed to update permissions");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="rounded-2xl">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-sm font-semibold">{access.department.name}</CardTitle>
            <p className="text-xs text-muted-foreground">{access.department.company.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-muted-foreground">{access.department.country}</span>
            {!isEditing ? (
              <>
                <button
                  onClick={() => {
                    setDraft(parsePermissions(access.permissions));
                    setIsEditing(true);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition">
                  <Pencil className="h-3 w-3" />
                  Edit
                </button>
                <button onClick={() => onRemove(access.department.id)} className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-2.5 py-1.5 text-xs font-medium text-destructive hover:bg-destructive/10 transition">
                  <Trash2 className="h-3 w-3" />
                  Remove
                </button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setDraft(parsePermissions(access.permissions));
                    setIsEditing(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition">
                  <X className="h-3 w-3" />
                  Cancel
                </button>
                <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-1.5 rounded-lg border border-primary bg-primary px-2.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition disabled:opacity-50">
                  {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Save
                </button>
              </div>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-1.5">
          {isEditing && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background px-3 py-3">
              <div>
                <p className="text-xs font-semibold">Bulk update</p>
                <p className="text-[11px] text-muted-foreground">
                  Select a permission and apply it to all modules in this department.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={bulkPermission}
                  onChange={(event) =>
                    setBulkPermission(event.target.value as PermissionValue)
                  }
                  className="h-8 rounded-lg border bg-background px-2 text-xs"
                >
                  <option value="NONE">None</option>
                  <option value="READ_ONLY">Read</option>
                  <option value="READ_WRITE">Read write</option>
                </select>
                <button
                  type="button"
                  onClick={applyBulkPermission}
                  className="h-8 rounded-lg border border-primary bg-primary px-3 text-xs font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Apply to all
                </button>
              </div>
            </div>
          )}

          {(isEditing ? draft : safePermissions).map((perm) => (
            <div key={perm.module} className="flex items-center justify-between rounded-lg bg-muted/20 px-3 py-2">
              <span className="text-xs font-medium">{perm.module}</span>
              {isEditing ? <PermissionToggle value={perm.permission} onChange={(val) => setDraft((prev) => prev.map((p) => (p.module === perm.module ? { ...p, permission: val } : p)))} /> : <PermissionBadge permission={perm.permission} />}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export default function UserDetailsPage() {
  const { id } = useParams<{ id: string }>();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [deptFilter, setDeptFilter] = useState("");
  const [showDeptPanel, setShowDeptPanel] = useState(false);
  const [pendingDept, setPendingDept] = useState<Department | null>(null);
  const [pendingRemoveDeptId, setPendingRemoveDeptId] = useState<string | null>(null);
  const [newDepartmentPermission, setNewDepartmentPermission] =
    useState<PermissionValue>("NONE");
  const [isAdding, setIsAdding] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const res = await getUser(id);
        setUser(res.data.user);
      } catch {
        setError("Failed to load user details.");
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, [id]);

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await getCompanies();
        setCompanies(res.data.companies);
      } catch {}
    };
    fetchCompanies();
  }, []);

  const assignedIds = user?.departmentAccesses.map((a) => a.department.id) ?? [];
  const filteredCompanies = deptFilter ? companies.filter((c) => c.id === deptFilter) : companies;
  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const {
    paginatedItems: paginatedDepartmentAccesses,
    ...departmentAccessPagination
  } = usePagination(departmentAccesses);

  const removingDeptName = user?.departmentAccesses.find((a) => a.department.id === pendingRemoveDeptId)?.department.name ?? "this department";

  const handlePermissionsSaved = (accessId: string, permissions: ModulePermission[]) => {
    setUser((prev) =>
      prev
        ? {
            ...prev,
            departmentAccesses: prev.departmentAccesses.map((a) => (a.id === accessId ? { ...a, permissions } : a)),
          }
        : prev,
    );
  };

  const handleConfirmAdd = async () => {
    if (!user || !pendingDept) return;
    try {
      setIsAdding(true);
      const res = await addUserDepartment(
        user.id,
        pendingDept.id,
        buildPermissionsWithLevel(newDepartmentPermission),
      );
      setUser((prev) =>
        prev
          ? {
              ...prev,
              departmentAccesses: [...prev.departmentAccesses, res.data.access],
              _count: { departmentAccesses: prev._count.departmentAccesses + 1 },
            }
          : prev,
      );
      toast.success(`${pendingDept.name} added`);
      setPendingDept(null);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      toast.error(e?.response?.data?.message ?? "Failed to add department");
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmRemove = async () => {
    if (!user || !pendingRemoveDeptId) return;
    try {
      setIsRemoving(true);
      await removeUserDepartment(user.id, pendingRemoveDeptId);
      setUser((prev) =>
        prev
          ? {
              ...prev,
              departmentAccesses: prev.departmentAccesses.filter((a) => a.department.id !== pendingRemoveDeptId),
              _count: { departmentAccesses: prev._count.departmentAccesses - 1 },
            }
          : prev,
      );
      toast.success("Department removed");
      setPendingRemoveDeptId(null);
    } catch {
      toast.error("Failed to remove department");
    } finally {
      setIsRemoving(false);
    }
  };

  if (loading)
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading user...
      </div>
    );

  if (error || !user) return <div className="flex h-64 items-center justify-center text-sm text-destructive">{error ?? "User not found."}</div>;

  return (
    <>
      <div className="space-y-6 p-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
              {user.fullName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{user.fullName}</h1>
              <p className="text-sm text-muted-foreground">User Details</p>
            </div>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${user.isActive ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{user.isActive ? "Active" : "Inactive"}</span>
        </div>

        {/* Info + Overview */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">User Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoItem icon={Users} label="Full Name" value={user.fullName} />
              <InfoItem icon={Mail} label="Email" value={user.email} />
              <InfoItem icon={Building2} label="Primary Company" value={user.company?.name ?? "—"} />
              <InfoItem icon={Shield} label="Role" value={user.role} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-2">
                  <Shield className="h-4 w-4" />
                  <span className="text-xs">Joined</span>
                </div>
                <p className="text-sm font-semibold">{new Date(user.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground mb-3">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="text-xs">Departments ({user._count?.departmentAccesses})</span>
                </div>
                {user.departmentAccesses.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No departments assigned</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {user.departmentAccesses.map((access) => (
                      <div key={access.id} className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium">{access.department.name}</p>
                          <p className="truncate text-xs text-muted-foreground">{access.department.company.name}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setPendingRemoveDeptId(access.department.id)}
                          className="rounded-lg border border-destructive/30 p-1 text-destructive transition hover:bg-destructive/10"
                          title="Remove department"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Department Access + Permissions */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold">Department Access & Permissions</h2>
            <Button variant="outline" className="rounded-xl h-8 px-3 text-xs" onClick={() => setShowDeptPanel((o) => !o)}>
              {showDeptPanel ? (
                <>
                  <X className="mr-1.5 h-3 w-3" />
                  Close
                </>
              ) : (
                <>
                  <Plus className="mr-1.5 h-3 w-3" />
                  Add Department
                </>
              )}
            </Button>
          </div>

          {/* Add department panel */}
          {showDeptPanel && (
            <Card className="rounded-2xl">
              <CardContent className="space-y-3 pt-5">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Filter by Company</Label>
                  <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm" value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}>
                    <option value="">All companies</option>
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Permission for new department</Label>
                  <select
                    className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                    value={newDepartmentPermission}
                    onChange={(event) =>
                      setNewDepartmentPermission(event.target.value as PermissionValue)
                    }
                  >
                    <option value="NONE">None</option>
                    <option value="READ_ONLY">Read</option>
                    <option value="READ_WRITE">Read write</option>
                  </select>
                </div>
                <div className="space-y-3">
                  {filteredCompanies.map((company) =>
                    company.departments.length > 0 ? (
                      <div key={company.id}>
                        <p className="mb-1.5 px-1 text-xs font-medium text-muted-foreground">{company.name}</p>
                        <div className="space-y-1.5">
                          {company.departments.map((dept) => {
                            const isAssigned = assignedIds.includes(dept.id);
                            return (
                              <div key={dept.id} className={`flex items-center justify-between rounded-xl border px-4 py-2.5 ${isAssigned ? "bg-muted/20 opacity-60" : ""}`}>
                                <div>
                                  <p className="text-sm font-medium">{dept.name}</p>
                                  <p className="text-xs text-muted-foreground">{dept.country}</p>
                                </div>
                                {isAssigned ? (
                                  <span className="text-xs text-muted-foreground">Already added</span>
                                ) : (
                                  <button onClick={() => setPendingDept(dept)} className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition">
                                    <Plus className="h-3 w-3" />
                                    Add
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : null,
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Existing department cards */}
          {user.departmentAccesses.length === 0 && !showDeptPanel ? (
            <Card className="rounded-2xl">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">No department access assigned yet.</CardContent>
            </Card>
          ) : (
            <>
              {paginatedDepartmentAccesses.map((access) => (
                <DepartmentPermissionCard
                  key={access.id}
                  access={access}
                  onSaved={handlePermissionsSaved}
                  onRemove={(departmentId) => setPendingRemoveDeptId(departmentId)}
                />
              ))}
              {departmentAccessPagination.total > 0 && (
                <Card className="overflow-hidden rounded-2xl">
                  <Pagination
                    page={departmentAccessPagination.page}
                    totalPages={departmentAccessPagination.totalPages}
                    start={departmentAccessPagination.start}
                    end={departmentAccessPagination.end}
                    total={departmentAccessPagination.total}
                    onPageChange={departmentAccessPagination.setPage}
                  />
                </Card>
              )}
            </>
          )}
        </div>
      </div>

      {/* Confirm add dialog */}
      <ConfirmDialog
        open={!!pendingDept}
        title="Add Department"
        description={`Are you sure you want to add ${user.fullName} to "${pendingDept?.name}"? All modules will be set to ${newDepartmentPermission === "READ_WRITE" ? "Read write" : newDepartmentPermission === "READ_ONLY" ? "Read" : "None"}.`}
        onConfirm={handleConfirmAdd}
        onCancel={() => setPendingDept(null)}
        isLoading={isAdding}
        confirmLabel="Yes, Add"
      />

      {/* Confirm remove dialog */}
      <ConfirmDialog
        open={!!pendingRemoveDeptId}
        title="Remove Department"
        description={`Are you sure you want to remove ${user.fullName} from "${removingDeptName}"? All permissions for this department will be lost.`}
        onConfirm={handleConfirmRemove}
        onCancel={() => setPendingRemoveDeptId(null)}
        isLoading={isRemoving}
        confirmLabel="Yes, Remove"
        confirmVariant="destructive"
      />
    </>
  );
}
