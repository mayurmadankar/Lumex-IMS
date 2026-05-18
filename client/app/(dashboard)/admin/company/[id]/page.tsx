import { redirect } from "next/navigation";

export default async function LegacyCompanyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/admin/companies/${id}`);
}
