"use client";

import {
  Building2,
  Calendar,
  ChevronDown,
  ChevronRight,
  MapPin,
  Save,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Controller,
  Control,
  FieldErrors,
  UseFormRegister,
  useForm,
  useWatch,
} from "react-hook-form";
import toast from "react-hot-toast";

import type { AccountTypeOption } from "@/api/services/account-type.service";
import { getAccountTypes } from "@/api/services/account-type.service";
import { createAccount } from "@/api/services/account.service";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useGeography } from "@/hooks/useGeography";
import { useAppSelector } from "@/store/hooks";

type SelectOption = string | { value: string; label: string };

type AccountFormValues = {
  accountTypeId: string;
  accountName: string;
  accountLongName: string;
  status: string;
  closeDate: string;
  closeReason: string;

  address: string;
  address2: string;
  countryIso2: string;
  stateId: string;
  city: string;
  zipCode: string;
  phone1: string;
  phone2: string;
  email: string;
  website: string;
  trnNo: string;
  isTaxable: boolean;

  popupRemark: string;
  remark: string;
  legalText1: string;
};

interface TextInputProps {
  register: UseFormRegister<AccountFormValues>;
  name: keyof AccountFormValues;
  type?: string;
  placeholder?: string;
}

interface SelectInputProps {
  control: Control<AccountFormValues>;
  name: keyof AccountFormValues;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

interface CheckboxProps {
  control: Control<AccountFormValues>;
  name: keyof AccountFormValues;
  label: string;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e7e5e4] bg-white">
      <div className="flex items-center gap-2 border-b border-[#efedea] bg-[#fcfcfb] px-4 py-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
          {icon}
        </div>
        <div className="text-[12px] font-semibold text-slate-800">{title}</div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}


function TextInput({ register, name, type = "text", placeholder = "" }: TextInputProps) {
  return <Input {...register(name)} type={type} placeholder={placeholder} className="h-9 text-[13px]" />;
}

function SelectInput({
  control,
  name,
  options,
  placeholder = "Select",
  disabled = false,
}: SelectInputProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          onValueChange={field.onChange}
          value={field.value ? String(field.value) : undefined}
          disabled={disabled}
        >
          <SelectTrigger className="h-9 text-[13px]" disabled={disabled}>
            <SelectValue placeholder={placeholder} />
          </SelectTrigger>
          <SelectContent>
            {options.map((option) => {
              const value = typeof option === "string" ? option : option.value;
              const label = typeof option === "string" ? option : option.label;

              return (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      )}
    />
  );
}

function Checkbox({ control, name, label }: CheckboxProps) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <button
          type="button"
          onClick={() => field.onChange(!field.value)}
          className="flex h-9 items-center gap-2 rounded-xl border border-[#dfddd8] bg-white px-3 text-[13px] text-slate-700 transition hover:border-cyan-300"
        >
          <span
            className={cx(
              "flex h-4 w-4 items-center justify-center rounded border transition",
              field.value
                ? "border-cyan-600 bg-cyan-600 text-white"
                : "border-slate-300 bg-white"
            )}
          >
            {field.value ? (
              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 10 10">
                <path
                  d="M1.5 5l2.2 2.2L8.5 2.5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : null}
          </span>
          <span>{label}</span>
        </button>
      )}
    />
  );
}

export default function AccountForm() {
  const router = useRouter();
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [accountTypes, setAccountTypes] = useState<AccountTypeOption[]>([]);
  const [accountTypesLoading, setAccountTypesLoading] = useState(true);
  const user = useAppSelector((state) => state.auth.user);
  const role = user?.role;
  const selectedDepartmentId = useAppSelector(
    (state) =>
      state.auth.user?.selectedDepartmentId ??
      state.auth.user?.departmentAccesses?.[0]?.departmentId,
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );
  const scope = role === "ORG_ADMIN" ? "admin" : "user";

  const {
    register,
    control,
    handleSubmit,
    reset,
    setError,
    setValue,
    formState: { isSubmitting },
  } = useForm<AccountFormValues>({
    defaultValues: {
      accountTypeId: "",
      status: "Active",
      isTaxable: true,
      countryIso2: "",
      stateId: "",
      city: "",
    },
  });

  const status = useWatch({ control, name: "status" });
  const selectedCountryIso2 = useWatch({ control, name: "countryIso2" });
  const selectedStateId = useWatch({ control, name: "stateId" });
  const selectedAccountTypeId = useWatch({ control, name: "accountTypeId" });
  const { countries, states, loading: geographyLoading } = useGeography(selectedCountryIso2);

  useEffect(() => {
    const loadAccountTypes = async () => {
      try {
        setAccountTypesLoading(true);
        const response = await getAccountTypes(scope);
        setAccountTypes(response.data.accountTypes ?? []);
      } catch {
        setAccountTypes([]);
      } finally {
        setAccountTypesLoading(false);
      }
    };

    loadAccountTypes();
  }, [scope]);

  useEffect(() => {
    if (!selectedAccountTypeId && accountTypes[0]) {
      setValue("accountTypeId", accountTypes[0].id);
    }
  }, [accountTypes, selectedAccountTypeId, setValue]);

  const countryOptions = countries.map((country) => ({
    value: country.iso2,
    label: `${country.name} (${country.iso2})`,
  }));
  const stateOptions = states.map((state) => ({
    value: state.id,
    label: `${state.name} (${state.code})`,
  }));
  const accountTypeOptions = accountTypes.map((accountType) => ({
    value: accountType.id,
    label: accountType.name,
  }));

  useEffect(() => {
    setValue("stateId", "");
    setValue("city", "");
  }, [selectedCountryIso2, setValue]);

  useEffect(() => {
    setValue("city", "");
  }, [selectedStateId, setValue]);

  const handleCancel = () => {
    router.back();
  };

  const onSubmit = async (data: AccountFormValues) => {
    const contextPayload =
      scope === "admin"
        ? { companyId: selectedCompanyId ?? undefined }
        : { departmentId: selectedDepartmentId ?? undefined };

    if (scope === "admin" && !contextPayload.companyId) {
      toast.error("Select a company before creating an account");
      return;
    }

    if (scope === "user" && !contextPayload.departmentId) {
      toast.error("Select a department before creating an account");
      return;
    }

    try {
      const payload = Object.fromEntries(
        Object.entries({ ...data, ...contextPayload }).filter(([, value]) => value !== ""),
      ) as Parameters<typeof createAccount>[1];
      const response = await createAccount(scope, payload);
      toast.success(`Account created: ${response.data.account.accountIndex}`);
      router.push("/user/accounting/accounts");
      reset({
        accountTypeId: accountTypes[0]?.id ?? "",
        status: "Active",
        isTaxable: true,
        countryIso2: "",
        stateId: "",
        city: "",
      });
    } catch (error: unknown) {
      const apiError = error as {
        response?: {
          data?: {
            message?: string;
            error?: Record<string, string[]>;
          };
        };
      };
      const fieldErrors = apiError.response?.data?.error;

      if (fieldErrors && typeof fieldErrors === "object") {
        Object.entries(fieldErrors).forEach(([field, messages]) => {
          setError(field as keyof AccountFormValues, {
            message: Array.isArray(messages) ? messages[0] : "Invalid value",
          });
        });
      }

      toast.error(apiError.response?.data?.message ?? "Failed to create account");
    }
  };

  const onError = (errors: FieldErrors<AccountFormValues>) => {
    console.log("Validation errors:", errors);
  };

  return (
    <div className="min-h-screen bg-[#f5f5f3] text-slate-900">
     <form onSubmit={handleSubmit(onSubmit, onError)} noValidate className="mx-auto max-w-[1320px]">

        {/* main panel */}
        <div className="overflow-hidden rounded-3xl border border-[#e7e5e4] bg-[#fbfbfa] shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          {/* panel top strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ece9e4] bg-white px-5 py-3">
            <div className="flex items-center gap-2">
              <div className="rounded-full bg-cyan-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-cyan-700">
                Account Master
              </div>
              <div className="text-[12px] text-slate-500">
                Fill core details and optional account information
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDetailsOpen((prev) => !prev)}
              className="h-9 rounded-xl px-3 py-2 text-[12px] font-medium text-slate-700 hover:bg-slate-50"
            >
              {detailsOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {detailsOpen ? "Hide Details" : "Show Details"}
            </Button>
          </div>

          <div className="space-y-5 p-5">
            {/* general */}
            <SectionCard title="General Information" icon={<Building2 className="h-4 w-4" />}>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                <Field label="Account Type" required>
                  <SelectInput
                    control={control}
                    name="accountTypeId"
                    options={accountTypeOptions}
                    placeholder={accountTypesLoading ? "Loading account types..." : "Select account type"}
                    disabled={accountTypesLoading}
                  />
                </Field>

                <Field label="Account Name" required>
                  <TextInput register={register} name="accountName" placeholder="Enter account name" />
                </Field>

                <Field label="Account Long Name">
                  <TextInput register={register} name="accountLongName" placeholder="Enter long name" />
                </Field>

                <Field label="Status">
                  <SelectInput
                    control={control}
                    name="status"
                    options={["Active", "Inactive", "Pending", "Closed"]}
                  />
                </Field>

                {status === "Closed" && (
                  <>
                    <Field label="Close Date">
                      <div className="relative">
                        <TextInput register={register} name="closeDate" type="date" />
                        <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      </div>
                    </Field>

                    <Field label="Close Reason">
                      <TextInput register={register} name="closeReason" placeholder="Enter close reason" />
                    </Field>
                  </>
                )}
              </div>
            </SectionCard>

            {detailsOpen && (
              <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
                {/* address */}
                <SectionCard title="Address Information" icon={<MapPin className="h-4 w-4" />}>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    <Field label="Address">
                      <TextInput register={register} name="address" placeholder="Enter address" />
                    </Field>

                    <Field label="Address 2">
                      <TextInput register={register} name="address2" placeholder="Enter address line 2" />
                    </Field>

                    <Field label="Country">
                      <SelectInput
                        control={control}
                        name="countryIso2"
                        options={countryOptions}
                        placeholder={geographyLoading.countries ? "Loading countries..." : "Select country"}
                        disabled={geographyLoading.countries}
                      />
                    </Field>

                    <Field label="State">
                      <SelectInput
                        control={control}
                        name="stateId"
                        options={stateOptions}
                        placeholder={
                          selectedCountryIso2
                            ? geographyLoading.states
                              ? "Loading states..."
                              : "Select state"
                            : "Select country first"
                        }
                        disabled={!selectedCountryIso2 || geographyLoading.states}
                      />
                    </Field>

                    <Field label="City">
                      <TextInput register={register} name="city" placeholder="Enter city" />
                    </Field>

                    <Field label="Zip Code">
                      <TextInput register={register} name="zipCode" placeholder="Enter zip code" />
                    </Field>

                    <Field label="Phone 1">
                      <TextInput register={register} name="phone1" type="tel" placeholder="Enter phone" />
                    </Field>

                    <Field label="Phone 2">
                      <TextInput register={register} name="phone2" type="tel" placeholder="Enter phone" />
                    </Field>

                    <Field label="Email">
                      <TextInput register={register} name="email" type="email" placeholder="Enter email" />
                    </Field>

                    <Field label="Website">
                      <TextInput register={register} name="website" placeholder="Enter website" />
                    </Field>

                    <Field label="TRN No.">
                      <TextInput register={register} name="trnNo" placeholder="Enter TRN number" />
                    </Field>

                    <Field label="Tax Setting">
                      <Checkbox control={control} name="isTaxable" label="Taxable account" />
                    </Field>
                  </div>
                </SectionCard>

                {/* remarks
                <SectionCard title="Remarks & Notes" icon={<FileText className="h-4 w-4" />}>
                  <div className="space-y-4">
                    <Field label="Popup Remark">
                      <textarea
                        {...register("popupRemark")}
                        className={textareaClassName()}
                        placeholder="Enter popup remark"
                      />
                    </Field>

                    <Field label="Remark">
                      <textarea
                        {...register("remark")}
                        className={textareaClassName()}
                        placeholder="Enter internal remark"
                      />
                    </Field>

                    <Field label="Legal Text 1">
                      <textarea
                        {...register("legalText1")}
                        className={textareaClassName()}
                        placeholder="Enter legal text"
                      />
                    </Field>
                  </div>
                </SectionCard> */}
              </div>
            )}
          </div>

          {/* footer */}
          <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-[#ece9e4] bg-white px-5 py-3">
            <div className="text-[12px] text-slate-500">
              Fields marked with <span className="font-semibold text-red-500">*</span> are required
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="h-9 px-4 text-[13px] rounded-xl font-medium text-slate-700 border-[#dfddd8]" onClick={handleCancel}>
                <X className="h-4 w-4" />
                Cancel
              </Button>

              <Button type="submit" variant="outline" className="h-9 px-4 text-[13px] rounded-xl font-medium text-slate-700 border-[#dfddd8]" disabled={isSubmitting}>
                <Save className="h-4 w-4" />
                {isSubmitting ? "Saving..." : "Save Account"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
