"use client";

import { ChangeEvent } from "react";

import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { setSelectedCompanyInAuth } from "@/store/slices/authSlice";
import { setSelectedCompanyId } from "@/store/slices/companySlice";
import { toggleSidebar } from "@/store/slices/uiSlice";

export default function TopBar() {
  const dispatch = useAppDispatch();

  const user = useAppSelector((state) => state.auth.user);
  const accessibleCompanies = useAppSelector(
    (state) => state.company.accessibleCompanies
  );
  const selectedCompanyId = useAppSelector(
    (state) => state.company.selectedCompanyId
  );
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen);

  const handleCompanyChange = (e: ChangeEvent<HTMLSelectElement>) => {
    const companyId = e.target.value || null;
    dispatch(setSelectedCompanyId(companyId));
    dispatch(setSelectedCompanyInAuth(companyId));
  };

  const selectedCompany =
    accessibleCompanies.find((company) => company.id === selectedCompanyId) ||
    null;

  return (
    <div className="flex items-center justify-between gap-4 border-b bg-white px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => dispatch(toggleSidebar())}
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          {sidebarOpen ? "Hide Menu" : "Show Menu"}
        </button>

        <div className="flex flex-col">
          <span className="text-sm font-semibold text-gray-900">
            {user?.role === "ORG_ADMIN" ? "Org Admin Workspace" : "User Workspace"}
          </span>
          <span className="text-xs text-gray-500">
            {user?.fullName || "Guest"}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {accessibleCompanies.length > 0 && (
          <div className="flex items-center gap-2">
            <label
              htmlFor="company-switcher"
              className="text-sm font-medium text-gray-600"
            >
              Company
            </label>

            <select
              id="company-switcher"
              value={selectedCompanyId ?? ""}
              onChange={handleCompanyChange}
              className="min-w-[220px] rounded-md border bg-white px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              <option value="" disabled>
                Select company
              </option>

              {accessibleCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                  {company.code ? ` (${company.code})` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="rounded-md border px-3 py-2 text-sm">
          <span className="font-medium text-gray-700">Current:</span>{" "}
          <span className="text-gray-900">
            {selectedCompany?.name || "No company selected"}
          </span>
        </div>

        <div className="rounded-md border bg-gray-50 px-3 py-2 text-sm">
          <span className="font-medium text-gray-700">Role:</span>{" "}
          <span className="text-gray-900">{user?.role || "-"}</span>
        </div>
      </div>
    </div>
  );
}