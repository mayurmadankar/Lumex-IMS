"use client";

import { ArrowLeft, ArrowRightLeft } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import TransferForm from "@/components/transfer/TransferForm";
import { Button } from "@/components/ui/button";
import { permissionAllows, permissionsToMap } from "@/config/modules";
import { useAppSelector } from "@/store/hooks";

export default function NewTransferPage() {
  const router = useRouter();
  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies,
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId ?? state.auth.user?.selectedCompanyId,
  );

  const departmentAccesses = useMemo(
    () => user?.departmentAccesses ?? [],
    [user?.departmentAccesses],
  );
  const selectedAccess =
    departmentAccesses.find(
      (access) => access.companyId === selectedCompanyId,
    ) ?? departmentAccesses[0];
  const currentCompany = useMemo(() => {
    if (!selectedCompanyId && selectedAccess) {
      return {
        id: selectedAccess.companyId,
        name: selectedAccess.companyName,
        code: selectedAccess.companyCode,
      };
    }

    return (
      accessibleCompanies.find((company) => company.id === selectedCompanyId) ??
      (selectedAccess
        ? {
            id: selectedAccess.companyId,
            name: selectedAccess.companyName,
            code: selectedAccess.companyCode,
          }
        : null)
    );
  }, [accessibleCompanies, selectedAccess, selectedCompanyId]);

  const canCreateTransfer = useMemo(
    () =>
      departmentAccesses
        .filter((access) => access.companyId === currentCompany?.id)
        .some((access) =>
          permissionAllows(
            permissionsToMap(access.permissions).NEW_TRANSFER,
            "READ_WRITE",
          ),
        ),
    [currentCompany?.id, departmentAccesses],
  );

  if (!canCreateTransfer) {
    return (
      <div className="p-6">
        <div className="rounded-2xl border border-dashed bg-background px-6 py-12 text-center text-sm text-muted-foreground">
          You do not have permission to create transfers in this company.
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="mx-auto max-w-5xl space-y-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Transfer
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              New Transfer
            </h1>
            <p className="text-sm text-muted-foreground">
              {currentCompany?.name ?? "Selected company"}
            </p>
          </div>

          <Button
            type="button"
            variant="outline"
            className="h-9 rounded-xl"
            onClick={() => router.push("/user/transfer/transfers")}
          >
            <ArrowLeft className="h-4 w-4" />
            Transfer List
          </Button>
        </div>

        <div className="rounded-2xl border bg-background p-5">
          <div className="mb-5 flex items-center gap-3 border-b pb-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border bg-muted/40">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold">Transfer Details</p>
              <p className="text-xs text-muted-foreground">
                Enter a Lot ID to load the available inventory item.
              </p>
            </div>
          </div>

          <TransferForm
            companyId={currentCompany?.id ?? null}
            onTransferred={() => router.push("/user/transfer/transfers")}
            submitLabel="Save and Close"
          />
        </div>
      </div>
    </div>
  );
}
