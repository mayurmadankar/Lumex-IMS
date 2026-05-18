"use client";

import { Building2, Mail, Globe, Hash, Loader2, Users, LayoutGrid, Plus, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import toast from "react-hot-toast";

import { getCompany, createDepartment } from "@/api/services/company.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Pagination from "@/components/ui/pagination";
import { useCountries } from "@/hooks/useCountries";
import { usePagination } from "@/hooks/use-pagination";

// ── Types ─────────────────────────────────────────────────────────────────────
type Department = {
  id: string;
  name: string;
  country: string;
  description: string | null;
  isActive: boolean;
  _count: { userAccesses: number };
};

type Company = {
  id: string;
  name: string;
  code?: string;
  country: string;
  companyEmail: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  departments: Department[];
  _count: { departments: number };
};

type DepartmentFormData = {
  name: string;
  country: string;
  description?: string;
};

type ApiFormError = {
  response?: {
    data?: {
      message?: string;
      error?: Record<string, string[]>;
    };
  };
};

type CountryLookup = {
  name: string;
  iso2: string;
};

function getCountryLabel(countries: CountryLookup[], value?: string) {
  if (!value) return "";
  const country = countries.find((item) => item.iso2 === value || item.name === value);
  return country ? `${country.name} (${country.iso2})` : value;
}

// ── Field ─────────────────────────────────────────────────────────────────────
function Field({
  label,
  required,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">
        {label}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

// ── Info Item ─────────────────────────────────────────────────────────────────
function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
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

// ── Add Department Modal ──────────────────────────────────────────────────────
function AddDepartmentModal({
  open,
  onClose,
  onCreated,
  companyId,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (dept: Department) => void;
  companyId: string;
}) {
  const { countries, loading: countriesLoading } = useCountries();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<DepartmentFormData>();

  const handleClose = () => {
    reset();
    onClose();
  };

  const onFormSubmit = async (data: DepartmentFormData) => {
    try {
      const res = await createDepartment(companyId, data);
      onCreated(res.data.department);
      toast.success("Department created successfully");
      reset();
      onClose();
    } catch (err: unknown) {
      const apiError = err as ApiFormError;
      const serverErrors = apiError?.response?.data?.error;
      if (serverErrors && typeof serverErrors === "object") {
        Object.entries(serverErrors).forEach(([field, messages]) => {
          setError(field as keyof DepartmentFormData, {
            message: (messages as string[])[0],
          });
        });
      } else {
        toast.error(apiError?.response?.data?.message ?? "Failed to create department");
      }
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={handleClose} />
      <div className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/40">
              <LayoutGrid className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Add Department</p>
              <p className="text-xs text-muted-foreground">Fill in the details below</p>
            </div>
          </div>
          <button onClick={handleClose} className="rounded-lg p-1.5 hover:bg-muted transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onFormSubmit)}>
          <div className="space-y-4 px-6 py-6">

            <Field label="Department Name" required error={errors.name?.message}>
              <Input
                placeholder="e.g. Finance"
                className="rounded-xl"
                {...register("name", {
                  required: "Department name is required",
                  minLength: { value: 2, message: "Must be at least 2 characters" },
                })}
              />
            </Field>

            <Field label="Country" required error={errors.country?.message}>
              <select
                className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                {...register("country", { required: "Country is required" })}
              >
                <option value="">
                  {countriesLoading ? "Loading countries..." : "Choose a country..."}
                </option>
                {countries.map((country) => (
                  <option key={country.id} value={country.iso2}>
                    {country.name} ({country.iso2})
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Description" error={errors.description?.message}>
              <Input
                placeholder="e.g. Handles all financial operations"
                className="rounded-xl"
                {...register("description")}
              />
            </Field>

          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 border-t px-6 py-4">
            <Button type="button" variant="outline" className="rounded-xl" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" className="rounded-xl" disabled={isSubmitting}>
              {isSubmitting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
              ) : (
                <><Plus className="mr-2 h-4 w-4" />Create Department</>
              )}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CompanyDetailsPage() {
  const { id } = useParams<{ id: string }>();
  const { countries } = useCountries();

  const [company, setCompany]     = useState<Company | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      try {
        const res = await getCompany(id);
        setCompany(res.data.company);
      } catch {
        setError("Failed to load company details.");
      } finally {
        setLoading(false);
      }
    };

    fetchCompany();
  }, [id]);

  const handleDepartmentCreated = (dept: Department) => {
    setCompany((prev) =>
      prev
        ? {
            ...prev,
            departments: [...prev.departments, { ...dept, _count: { userAccesses: 0 } }],
            _count: { departments: prev._count?.departments + 1 },
          }
        : prev
    );
  };
  const departments = useMemo(() => company?.departments ?? [], [company?.departments]);
  const {
    paginatedItems: paginatedDepartments,
    ...departmentPagination
  } = usePagination(departments);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading company...
      </div>
    );
  }

  if (error || !company) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-destructive">
        {error ?? "Company not found."}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 p-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{company.name}</h1>
            <p className="text-sm text-muted-foreground">Company Details</p>
          </div>
          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
            company.status === "ACTIVE"
              ? "bg-green-100 text-green-700"
              : "bg-muted text-muted-foreground"
          }`}>
            {company.status === "ACTIVE" ? "Active" : "Inactive"}
          </span>
        </div>

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Company Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoItem icon={Building2} label="Company Name" value={company.name} />
              <InfoItem icon={Hash}      label="Company Code" value={company.code ?? "—"} />
              <InfoItem icon={Mail}      label="Email"        value={company.companyEmail} />
              <InfoItem icon={Globe}     label="Country"      value={getCountryLabel(countries, company.country)} />
            </CardContent>
          </Card>

          <Card className="rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Overview</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <LayoutGrid className="h-4 w-4" />
                  <span className="text-xs">Departments</span>
                </div>
                <p className="mt-2 text-3xl font-semibold">{company?._count?.departments}</p>
              </div>
              <div className="rounded-xl border bg-muted/20 p-4">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span className="text-xs">Total Users</span>
                </div>
                <p className="mt-2 text-3xl font-semibold">
                  {company.departments.reduce((sum, d) => sum + d._count?.userAccesses, 0)}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Departments */}
        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Departments</CardTitle>
            <Button className="rounded-xl" onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Department
            </Button>
          </CardHeader>
          <CardContent>
            {company.departments.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No departments yet. Add one to get started.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-125 text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-3 font-medium">Name</th>
                      <th className="py-3 font-medium">Country</th>
                      <th className="py-3 font-medium">Description</th>
                      <th className="py-3 font-medium">Users</th>
                      <th className="py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDepartments.map((dept) => (
                      <tr key={dept.id} className="border-b last:border-0">
                        <td className="py-4 font-medium">{dept.name}</td>
                        <td className="py-4 text-muted-foreground">{getCountryLabel(countries, dept.country)}</td>
                        <td className="py-4 text-muted-foreground">{dept.description ?? "—"}</td>
                        <td className="py-4">{dept._count?.userAccesses}</td>
                        <td className="py-4">
                          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            dept.isActive
                              ? "bg-green-100 text-green-700"
                              : "bg-muted text-muted-foreground"
                          }`}>
                            {dept.isActive ? "Active" : "Inactive"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                </div>
                <Pagination
                  page={departmentPagination.page}
                  totalPages={departmentPagination.totalPages}
                  start={departmentPagination.start}
                  end={departmentPagination.end}
                  total={departmentPagination.total}
                  onPageChange={departmentPagination.setPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddDepartmentModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleDepartmentCreated}
        companyId={company.id}
      />
    </>
  );
}
