import { Plus, Building2, Loader2, Pencil } from "lucide-react";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { createCompany, updateCompany } from "@/api/services/company.service";
import { Button } from "@/components/ui/button";
import { Field }from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import Modal, { ModalBody, ModalFooter } from "@/components/ui/modal";
import { useCountries } from "@/hooks/useCountries";

type BaseCompanyFormData = {
  name: string;
  code?: string;
  country: string;
  companyEmail: string;
};

type CompanyFormData = BaseCompanyFormData & {
  defaultDepartmentName: string;
};

type EditCompanyFormData = BaseCompanyFormData & {
  status: "ACTIVE" | "INACTIVE";
};

type Company = {
  id: string;
  name: string;
  code?: string;
  country: string;
  companyEmail: string;
  status: "ACTIVE" | "INACTIVE";
  _count: { departments: number };
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

function resolveCountryIso2(countries: CountryLookup[], value?: string) {
  if (!value) return "";
  return countries.find((country) => country.iso2 === value || country.name === value)?.iso2 ?? value;
}

export function AddCompanyModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (company: Company) => void }) {
  const { countries, loading: countriesLoading } = useCountries();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CompanyFormData>({
    defaultValues: {
      defaultDepartmentName: "office",
    },
  });

  const handleClose = () => {
    reset();
    onClose();
  };

  const onFormSubmit = async (data: CompanyFormData) => {
    try {
      const res = await createCompany(data);
      onCreated(res.data.company);
      reset();
      onClose();
    } catch (err: unknown) {
      const apiError = err as ApiFormError;
      const serverErrors = apiError?.response?.data?.error;
      if (serverErrors && typeof serverErrors === "object") {
        Object.entries(serverErrors).forEach(([field, messages]) => {
          setError(field as keyof CompanyFormData, { message: (messages as string[])[0] });
        });
      } else {
        setError("root", { message: apiError?.response?.data?.message ?? "Something went wrong" });
      }
    }
  };

  if (!open) return null;

  return (
    <Modal open={open} onClose={handleClose} title="Add Company" subtitle="Fill in the details below" icon={<Building2 className="h-4 w-4" />}>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <ModalBody className="grid grid-cols-2 gap-4">
          {errors.root && <div className="col-span-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors.root.message}</div>}
          <Field label="Company Name" required error={errors.name?.message} hint="Full legal name">
            <Input placeholder="e.g. Acme Corporation" className="rounded-xl" {...register("name", { required: "Company name is required", minLength: { value: 2, message: "Must be at least 2 characters" } })} />
          </Field>
          <Field label="Company Code" error={errors.code?.message} hint="Short identifier, display only">
            <Input placeholder="e.g. ACM" className="rounded-xl uppercase" {...register("code", { minLength: { value: 2, message: "Must be at least 2 characters" }, maxLength: { value: 10, message: "Must be at most 10 characters" } })} />
          </Field>
          <Field label="Country" required error={errors.country?.message}>
            <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm" {...register("country", { required: "Country is required" })}>
              <option value="">{countriesLoading ? "Loading countries..." : "Choose a country..."}</option>
              {countries.map((country) => (
                <option key={country.id} value={country.iso2}>
                  {country.name} ({country.iso2})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Company Email" required error={errors.companyEmail?.message}>
            <Input type="email" placeholder="e.g. info@acme.com" className="rounded-xl" {...register("companyEmail", { required: "Company email is required", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address" } })} />
          </Field>
          <Field label="Default Department" required error={errors.defaultDepartmentName?.message}>
            <Input
              placeholder="office"
              className="rounded-xl"
              {...register("defaultDepartmentName", {
                required: "Default department name is required",
                minLength: { value: 2, message: "Must be at least 2 characters" },
              })}
            />
          </Field>
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
                Create Company
              </>
            )}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}

export function EditCompanyModal({ company, onClose, onUpdated }: { company: Company | null; onClose: () => void; onUpdated: (company: Company) => void }) {
  const { countries, loading: countriesLoading } = useCountries();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<EditCompanyFormData>();

  // Populate form when company changes
  useEffect(() => {
    if (company) {
      reset({
        name: company.name,
        code: company.code ?? "",
        country: resolveCountryIso2(countries, company.country),
        companyEmail: company.companyEmail,
        status: company.status,
      });
    }
  }, [company, countries, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  const onFormSubmit = async (data: EditCompanyFormData) => {
    if (!company) return;
    try {
      const res = await updateCompany(company.id, data);
      onUpdated(res.data.company);
      onClose();
    } catch (err: unknown) {
      const apiError = err as ApiFormError;
      const serverErrors = apiError?.response?.data?.error;
      if (serverErrors && typeof serverErrors === "object") {
        Object.entries(serverErrors).forEach(([field, messages]) => {
          setError(field as keyof EditCompanyFormData, { message: (messages as string[])[0] });
        });
      } else {
        setError("root", { message: apiError?.response?.data?.message ?? "Something went wrong" });
      }
    }
  };

  if (!company) return null;

  return (
    <Modal open={!!company} onClose={handleClose} title="Edit Company" subtitle={company?.name} icon={<Pencil className="h-4 w-4" />}>
      <form onSubmit={handleSubmit(onFormSubmit)}>
        <ModalBody className="grid grid-cols-2 gap-4">
          {errors.root && <div className="col-span-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{errors.root.message}</div>}
          <Field label="Company Name" required error={errors.name?.message}>
            <Input placeholder="e.g. Acme Corporation" className="rounded-xl" {...register("name", { required: "Company name is required", minLength: { value: 2, message: "Must be at least 2 characters" } })} />
          </Field>
          <Field label="Company Code" error={errors.code?.message} hint="Short identifier, display only">
            <Input placeholder="e.g. ACM" className="rounded-xl uppercase" {...register("code", { minLength: { value: 2, message: "Must be at least 2 characters" }, maxLength: { value: 10, message: "Must be at most 10 characters" } })} />
          </Field>
          <Field label="Country" required error={errors.country?.message}>
            <select className="w-full rounded-xl border bg-background px-3 py-2 text-sm" {...register("country", { required: "Country is required" })}>
              <option value="">{countriesLoading ? "Loading countries..." : "Choose a country..."}</option>
              {countries.map((country) => (
                <option key={country.id} value={country.iso2}>
                  {country.name} ({country.iso2})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Company Email" required error={errors.companyEmail?.message}>
            <Input type="email" placeholder="e.g. info@acme.com" className="rounded-xl" {...register("companyEmail", { required: "Company email is required", pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: "Enter a valid email address" } })} />
          </Field>
          <div className="col-span-2">
            <Field label="Status" required error={errors.status?.message}>
              <div className="flex gap-3">
                {(["ACTIVE", "INACTIVE"] as const).map((s) => (
                  <label key={s} className="flex flex-1 cursor-pointer items-center gap-2.5 rounded-xl border px-4 py-3 transition has-checked:border-primary has-checked:bg-primary/5">
                    <input type="radio" value={s} className="accent-primary" {...register("status", { required: "Status is required" })} />
                    <span className="text-sm font-medium">{s === "ACTIVE" ? "Active" : "Inactive"}</span>
                    <span className={`ml-auto h-2 w-2 rounded-full ${s === "ACTIVE" ? "bg-green-500" : "bg-muted-foreground"}`} />
                  </label>
                ))}
              </div>
            </Field>
          </div>
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
