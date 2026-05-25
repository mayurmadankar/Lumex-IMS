import {
  Plus,
  Loader2,
  Users,
  Trash2,
  ShieldCheck,
  Pencil,
  Eye,
  EyeOff,
  Search,
  ChevronDown,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useForm, useFieldArray, useWatch } from "react-hook-form";

import { getCompanies } from "@/api/services/company.service";
import { createUser, updateUser } from "@/api/services/user.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import { buildDefaultPermissions } from "@/config/modules";
import type { GroupPermission, PermissionLevel } from "@/config/modules";


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

type DepartmentAccess = {
  departmentId: string;
  permissions: GroupPermission[];
};

type UserFormData = {
  fullName: string;
  email: string;
  password: string;
  companyId: string;
  departmentAccesses: DepartmentAccess[];
};

type EditUserFormData = {
  email: string;
  isActive: boolean;
};

type Department = {
  id: string;
  name: string;
  country: string;
};

type Company = {
  id: string;
  name: string;
  code?: string;
  departments: Department[];
};

type ApiFormError = {
  response?: {
    data?: {
      message?: string;
      error?: Record<string, string[]>;
    };
  };
};

const permissionLabels: Record<PermissionLevel, string> = {
  NONE: "None",
  READ_ONLY: "Read",
  READ_WRITE: "Read write",
};

const buildPermissionsWithLevel = (permission: PermissionLevel): GroupPermission[] =>
  buildDefaultPermissions().map((item) => ({ ...item, permission }));

const summarizePermissions = (permissions?: GroupPermission[]) => {
  if (!permissions?.length) return "None";

  const first = permissions[0]?.permission ?? "NONE";
  return permissions.every((item) => item.permission === first)
    ? permissionLabels[first]
    : "Mixed";
};

const companyLabel = (company: Company) =>
  company.code ? `${company.name} (${company.code})` : company.name;

type AddUserModalProps = {
  open: boolean;
  onClose: () => void;
  onCreated: (user: User) => void;
  lockedCompany?: Company;
};

export function EditUserModal({ user, onClose, onUpdated }: { user: User | null; onClose: () => void; onUpdated: (updated: User) => void }) {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    control,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditUserFormData>();

  useEffect(() => {
    if (user) {
      reset({ email: user.email, isActive: user.isActive });
    }
  }, [user, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const isActive = useWatch({ control, name: "isActive" });

  const onFormSubmit = async (data: EditUserFormData) => {
    if (!user) return;
    try {
      const res = await updateUser(user.id, data);
      onUpdated(res.data.user);
      handleClose();
    } catch (err: unknown) {
      const apiError = err as ApiFormError;
      const serverErrors = apiError?.response?.data?.error;
      if (serverErrors && typeof serverErrors === "object") {
        Object.entries(serverErrors).forEach(([field, messages]) => {
          setError(field as keyof EditUserFormData, { message: (messages as string[])[0] });
        });
      } else {
        setError("root", { message: apiError?.response?.data?.message ?? "Something went wrong" });
      }
    }
  };

  return (
    <Modal open={!!user} onClose={handleClose} title="Edit User" subtitle={user?.fullName} icon={<Pencil className="h-4 w-4" />} maxWidth="sm">
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <ModalBody className="space-y-5">
          {errors.root && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors.root.message}</div>}

          {/* Email */}
          <Field label="Email" required error={errors.email?.message}>
            <Input
              type="email"
              placeholder="e.g. riya@example.com"
              className="rounded-xl"
              {...register("email", {
                required: "Email is required",
                pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" },
              })}
            />
          </Field>

          {/* Status toggle */}
          <Field label="Status" required error={errors.isActive?.message as string}>
            <div className="flex gap-3">
              {([true, false] as const).map((val) => (
                <label key={String(val)} className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 transition has-checked:border-primary has-checked:bg-primary/5">
                  <input type="radio" className="accent-primary" checked={isActive === val} onChange={() => setValue("isActive", val, { shouldDirty: true })} />
                  <span className="text-sm font-medium">{val ? "Active" : "Inactive"}</span>
                  <span className={`ml-auto h-2 w-2 rounded-full ${val ? "bg-green-500" : "bg-muted-foreground"}`} />
                </label>
              ))}
            </div>
          </Field>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="outline" className="rounded-xl" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" className="rounded-xl" disabled={isSubmitting || !isDirty}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Changes"
            )}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export function AddUserModal({
  open,
  onClose,
  onCreated,
  lockedCompany,
}: AddUserModalProps) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companySearch, setCompanySearch] = useState("");
  const [companyDropdownOpen, setCompanyDropdownOpen] = useState(false);
  const [deptCompanyFilter, setDeptCompanyFilter] = useState("");
  const [departmentPermissionPreset, setDepartmentPermissionPreset] =
    useState<PermissionLevel>("NONE");
  const [passwordVisible, setPasswordVisible] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    setValue,
    clearErrors,
    control,
    formState: { errors, isSubmitting },
  } = useForm<UserFormData>({
    defaultValues: { companyId: "", departmentAccesses: [] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: "departmentAccesses" });
  const selectedCompanyId = useWatch({ control, name: "companyId" }) ?? "";
  const selectedDepartmentAccesses =
    useWatch({ control, name: "departmentAccesses" }) ?? [];
  const companyOptions = useMemo(
    () => (lockedCompany ? [lockedCompany] : companies),
    [companies, lockedCompany],
  );
  const selectedCompany = companyOptions.find((company) => company.id === selectedCompanyId);
  const selectedCompanyLabel = selectedCompany ? companyLabel(selectedCompany) : "";
  const companySearchValue =
    companySearch === selectedCompanyLabel ? "" : companySearch.trim().toLowerCase();
  const filteredPrimaryCompanies = useMemo(
    () =>
      companySearchValue
        ? companyOptions.filter((company) =>
            [company.name, company.code]
              .filter(Boolean)
              .some((value) => value!.toLowerCase().includes(companySearchValue)),
          )
        : companyOptions,
    [companyOptions, companySearchValue],
  );

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await getCompanies();
        setCompanies(res.data.companies);
      } catch {}
    };
    if (open && !lockedCompany) fetchCompanies();
  }, [lockedCompany, open]);

  useEffect(() => {
    if (!open || !lockedCompany) return;

    setValue("companyId", lockedCompany.id, {
      shouldDirty: false,
      shouldValidate: true,
    });
    clearErrors("companyId");
  }, [clearErrors, lockedCompany, open, setValue]);

  const handleClose = () => {
    reset();
    setCompanySearch("");
    setCompanyDropdownOpen(false);
    setDeptCompanyFilter("");
    setDepartmentPermissionPreset("NONE");
    setPasswordVisible(false);
    onClose();
  };
  const filteredCompany = companyOptions.find((c) => c.id === deptCompanyFilter);
  const departmentCompanyOptions = lockedCompany
    ? [lockedCompany]
    : deptCompanyFilter
      ? [filteredCompany].filter((company): company is Company => Boolean(company))
      : companyOptions;

  const handleCompanySelect = (company: Company) => {
    setValue("companyId", company.id, {
      shouldDirty: true,
      shouldValidate: true,
    });
    clearErrors("companyId");
    setCompanySearch(companyLabel(company));
    setDeptCompanyFilter(company.id);
    setCompanyDropdownOpen(false);
  };

  const handleCompanySearchChange = (value: string) => {
    setCompanySearch(value);
    setCompanyDropdownOpen(true);
    if (selectedCompany && value !== selectedCompanyLabel) {
      setValue("companyId", "", {
        shouldDirty: true,
        shouldValidate: true,
      });
    }
  };

  const addDepartmentAccess = (departmentId: string) => {
    if (fields.some((f) => f.departmentId === departmentId)) return;
    append({
      departmentId,
      permissions: buildPermissionsWithLevel(departmentPermissionPreset),
    });
  };

  const setDepartmentPermission = (
    index: number,
    permission: PermissionLevel,
  ) => {
    setValue(
      `departmentAccesses.${index}.permissions`,
      buildPermissionsWithLevel(permission),
      { shouldDirty: true },
    );
  };

  const getDepartmentName = (departmentId: string) => {
    for (const company of companyOptions) {
      const dept = company.departments.find((d) => d.id === departmentId);
      if (dept) return { name: dept.name, company: company.name };
    }
    return { name: departmentId, company: "" };
  };

  const onFormSubmit = async (data: UserFormData) => {
    try {
      const res = await createUser(data);
      onCreated(res.data.user);
      handleClose();
    } catch (err: unknown) {
      const apiError = err as ApiFormError;
      const serverErrors = apiError?.response?.data?.error;
      if (serverErrors && typeof serverErrors === "object") {
        Object.entries(serverErrors).forEach(([field, messages]) => {
          setError(field as keyof UserFormData, { message: (messages as string[])[0] });
        });
      } else {
        setError("root", { message: apiError?.response?.data?.message ?? "Something went wrong" });
      }
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Add User" subtitle="Create a new user account" icon={<Users className="h-4 w-4" />} maxWidth="lg">
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <ModalBody className="space-y-6">
          {errors.root && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors.root.message}</div>}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Full Name" required error={errors.fullName?.message}>
              <Input placeholder="e.g. Riya Shah" className="rounded-xl" {...register("fullName", { required: "Full name is required", minLength: { value: 2, message: "Must be at least 2 characters" } })} />
            </Field>
            <Field label="Email" required error={errors.email?.message}>
              <Input type="email" placeholder="e.g. riya@example.com" className="rounded-xl" {...register("email", { required: "Email is required", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email" } })} />
            </Field>
            <Field label="Password" required error={errors.password?.message}>
              <div className="relative">
                <Input
                  type={passwordVisible ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  className="rounded-xl pr-10"
                  autoComplete="new-password"
                  {...register("password", {
                    required: "Password is required",
                    minLength: { value: 6, message: "Must be at least 6 characters" },
                  })}
                />
                <button
                  type="button"
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  aria-label={passwordVisible ? "Hide password" : "Show password"}
                  title={passwordVisible ? "Hide password" : "Show password"}
                >
                  {passwordVisible ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </Field>
            <Field label="Primary Company" required error={errors.companyId?.message}>
              <div className="relative">
                <input
                  type="hidden"
                  {...register("companyId", { required: "Company is required" })}
                />
                {lockedCompany ? (
                  <Input
                    value={companyLabel(lockedCompany)}
                    className="rounded-xl bg-muted/40"
                    readOnly
                  />
                ) : (
                  <>
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={companySearch}
                      placeholder="Search company..."
                      className="rounded-xl pl-9 pr-9"
                      role="combobox"
                      aria-expanded={companyDropdownOpen}
                      aria-autocomplete="list"
                      onFocus={(event) => {
                        setCompanyDropdownOpen(true);
                        event.currentTarget.select();
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setCompanyDropdownOpen(false), 120);
                      }}
                      onChange={(event) => handleCompanySearchChange(event.target.value)}
                    />
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />

                    {companyDropdownOpen && (
                      <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-xl border bg-background py-1 text-sm shadow-lg">
                        {filteredPrimaryCompanies.length === 0 ? (
                          <div className="px-3 py-2 text-muted-foreground">
                            No companies found
                          </div>
                        ) : (
                          filteredPrimaryCompanies.map((company) => {
                            const isSelected = company.id === selectedCompanyId;

                            return (
                              <button
                                key={company.id}
                                type="button"
                                className={`flex w-full items-center justify-between px-3 py-2 text-left transition hover:bg-muted ${
                                  isSelected ? "bg-muted/70 font-medium" : ""
                                }`}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  handleCompanySelect(company);
                                }}
                              >
                                <span>{companyLabel(company)}</span>
                                {isSelected && (
                                  <span className="text-xs text-muted-foreground">
                                    Selected
                                  </span>
                                )}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </Field>
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Department Access</p>
              <span className="text-xs text-muted-foreground">- choose module access before creating</span>
            </div>

            <div className={`grid gap-3 ${lockedCompany ? "md:grid-cols-[1fr_180px]" : "md:grid-cols-[1fr_1fr_180px]"}`}>
              {!lockedCompany && (
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Filter by Company</Label>
                  <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm" value={deptCompanyFilter} onChange={(e) => setDeptCompanyFilter(e.target.value)}>
                    <option value="">All companies</option>
                    {companyOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {companyLabel(c)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Add Department</Label>
                <select
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  onChange={(e) => {
                    if (e.target.value) addDepartmentAccess(e.target.value);
                    e.target.value = "";
                  }}
                  defaultValue="">
                  <option value="">Choose a department...</option>
                  {departmentCompanyOptions.map((company) =>
                    company.departments.length > 0 ? (
                      <optgroup key={company.id} label={company.name}>
                        {company.departments.map((d) => (
                          <option key={d.id} value={d.id} disabled={fields.some((f) => f.departmentId === d.id)}>
                            {d.name} {fields.some((f) => f.departmentId === d.id) ? "(added)" : ""}
                          </option>
                        ))}
                      </optgroup>
                    ) : null,
                  )}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Default Permission</Label>
                <select
                  className="w-full rounded-xl border bg-background px-3 py-2 text-sm"
                  value={departmentPermissionPreset}
                  onChange={(event) =>
                    setDepartmentPermissionPreset(event.target.value as PermissionLevel)
                  }
                >
                  <option value="NONE">None</option>
                  <option value="READ_ONLY">Read</option>
                  <option value="READ_WRITE">Read write</option>
                </select>
              </div>
            </div>

            {fields.length === 0 ? (
              <p className="rounded-xl border border-dashed py-4 text-center text-xs text-muted-foreground">No department access assigned yet</p>
            ) : (
              <div className="space-y-2">
                {fields.map((field, index) => {
                  const { name, company } = getDepartmentName(field.departmentId);
                  const currentPermission = summarizePermissions(
                    selectedDepartmentAccesses[index]?.permissions,
                  );
                  return (
                    <div key={field.id} className="flex flex-col gap-3 rounded-xl border bg-muted/20 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">{name}</p>
                        <p className="text-xs text-muted-foreground">{company}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          className="h-8 rounded-lg border bg-background px-2 text-xs"
                          value={
                            currentPermission === "Read write"
                              ? "READ_WRITE"
                              : currentPermission === "Read"
                                ? "READ_ONLY"
                                : "NONE"
                          }
                          onChange={(event) =>
                            setDepartmentPermission(
                              index,
                              event.target.value as PermissionLevel,
                            )
                          }
                        >
                          <option value="NONE">None</option>
                          <option value="READ_ONLY">Read</option>
                          <option value="READ_WRITE">Read write</option>
                        </select>
                        <button type="button" onClick={() => remove(index)} className="rounded-lg p-1 text-muted-foreground hover:bg-muted hover:text-destructive transition">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {fields.length > 0 && (
              <p className="text-xs text-muted-foreground">
                The selected permission is applied to every module for that department. You can fine tune individual modules from the user detail page.
              </p>
            )}
          </div>
        </ModalBody>

        <ModalFooter>
          <Button type="button" variant="outline" className="rounded-xl" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button type="submit" className="rounded-xl" disabled={isSubmitting}>
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="mr-2 h-4 w-4" />
                Create User
              </>
            )}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
