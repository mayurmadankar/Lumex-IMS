"use client";

import { Plus, Loader2, Pencil, Eye } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useEffect, useMemo } from "react";

import { AddCompanyModal, EditCompanyModal } from "./companyFormModal";

import { getCompanies } from "@/api/services/company.service";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import Pagination from "@/components/ui/pagination";
import { TableSearchBar } from "@/components/ui/table-search-bar";
import { usePagination } from "@/hooks/use-pagination";
import { matchesTableSearch } from "@/lib/table-search";

type Company = {
  id: string;
  name: string;
  code?: string;
  country: string;
  companyEmail: string;
  status: "ACTIVE" | "INACTIVE";
  _count: { departments: number };
};

export default function CompaniesView() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editCompany, setEditCompany] = useState<Company | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const fetchCompanies = async () => {
      try {
        const res = await getCompanies();
        setCompanies(res.data.companies);
      } catch {
        setError("Failed to load companies");
      } finally {
        setLoading(false);
      }
    };
    fetchCompanies();
  }, []);

  const handleCreated = (company: Company) => {
    setCompanies((prev) => [company, ...prev]);
  };

  const handleUpdated = (updated: Company) => {
    setCompanies((prev) =>
      prev.map((c) => (c.id === updated.id ? updated : c)),
    );
    setEditCompany(null);
  };
  const filteredCompanies = useMemo(() => {
    const value = search.trim();
    if (!value) return companies;

    return companies.filter((company) =>
      matchesTableSearch(
        [
          company.name,
          company.code,
          company.companyEmail,
          company.country,
          company._count?.departments,
          company.status === "ACTIVE" ? "Active" : "Inactive",
        ],
        value,
      ),
    );
  }, [companies, search]);
  const { paginatedItems: paginatedCompanies, ...companyPagination } =
    usePagination(filteredCompanies);

  return (
    <>
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Companies</h1>
          <p className="text-sm text-muted-foreground">
            Manage all companies under the organization.
          </p>
        </div>

        <Card className="rounded-2xl">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Company List</CardTitle>
            <Button className="rounded-xl" onClick={() => setModalOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Button>
          </CardHeader>

          <CardContent className="space-y-4">
            <TableSearchBar
              search={search}
              onSearch={setSearch}
              placeholder="Search companies"
            />
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading companies...
              </div>
            ) : error ? (
              <div className="py-12 text-center text-sm text-destructive">
                {error}
              </div>
            ) : filteredCompanies.length === 0 ? (
              <div className="py-12 text-center text-sm text-muted-foreground">
                No companies found.
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-150 text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="py-3 font-medium">Name</th>
                        <th className="py-3 font-medium">Code</th>
                        <th className="py-3 font-medium">Email</th>
                        <th className="py-3 font-medium">Country</th>
                        <th className="py-3 font-medium">Departments</th>
                        <th className="py-3 font-medium">Status</th>
                        <th className="py-3 font-medium w-50">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCompanies.map((company) => (
                        <tr key={company.id} className="border-b last:border-0">
                          <td className="py-4 font-medium">{company.name}</td>
                          <td className="py-4 text-muted-foreground">
                            {company.code ?? "—"}
                          </td>
                          <td className="py-4 text-muted-foreground">
                            {company.companyEmail}
                          </td>
                          <td className="py-4">{company.country}</td>
                          <td className="py-4">
                            {company._count?.departments}
                          </td>
                          <td className="py-4">
                            <span
                              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${company.status === "ACTIVE" ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}
                            >
                              {company.status === "ACTIVE"
                                ? "Active"
                                : "Inactive"}
                            </span>
                          </td>
                          <td className="py-4">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() =>
                                  router.push(`/admin/companies/${company.id}`)
                                }
                                className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium hover:bg-muted transition"
                              >
                                <Eye className="h-3.5 w-3.5" />
                                View
                              </button>
                              <button
                                onClick={() => setEditCompany(company)}
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
                  page={companyPagination.page}
                  totalPages={companyPagination.totalPages}
                  start={companyPagination.start}
                  end={companyPagination.end}
                  total={companyPagination.total}
                  onPageChange={companyPagination.setPage}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <AddCompanyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
      <EditCompanyModal
        company={editCompany}
        onClose={() => setEditCompany(null)}
        onUpdated={handleUpdated}
      />
    </>
  );
}
