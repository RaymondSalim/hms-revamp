import { notFound } from "next/navigation";
import { getTenantProfile } from "@/app/_db/tenant";
import { computeFinancialSummary } from "@/app/_lib/util/financial-summary";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { TenantProfileHeader } from "./tenant-profile-header";
import { FinancialSummaryCards } from "./financial-summary-cards";
import { BookingsSection } from "./bookings-section";
import { BillsPaymentsSection } from "./bills-payments-section";
import { NotesSection } from "./notes-section";
import Link from "next/link";

export default async function TenantProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { authorized, permissions } = await checkPermission("tenants.view");
  if (!authorized) return <AccessDenied />;

  const { id } = await params;
  const tenant = await getTenantProfile(id);
  if (!tenant) notFound();

  const summary = computeFinancialSummary(tenant.bookings);

  const serialized = serializeForClient({
    tenant,
    summary,
  });

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
        <Link
          href="/residents/tenants"
          className="hover:underline"
          style={{ color: "var(--color-accent)" }}
        >
          Penyewa
        </Link>
        <span>/</span>
        <span style={{ color: "var(--color-text-primary)" }}>{tenant.name}</span>
      </nav>

      <TenantProfileHeader tenant={serialized.tenant} />

      <FinancialSummaryCards summary={serialized.summary} />

      <BookingsSection bookings={serialized.tenant.bookings} />

      <BillsPaymentsSection bookings={serialized.tenant.bookings} />

      <NotesSection
        notes={serialized.tenant.notes}
        tenantId={tenant.id}
      />
    </div>
  );
}
