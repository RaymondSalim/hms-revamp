import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { getGroupedIncomeExpense } from "@/app/_db/dashboard";
import { businessToday } from "@/app/_lib/util/business-time";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { SummaryClient, type SummaryData } from "./summary-client";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function FinancialSummaryPage() {
  const { authorized } = await checkPermission("financials.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  if (!selectedLocationId) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--color-text-secondary)" }}>
          Tidak ada lokasi tersedia. Silakan tambahkan lokasi terlebih dahulu.
        </p>
      </div>
    );
  }
  const locationId = selectedLocationId;

  // Default period: last 30 days. Transaction.date is a @db.Date at midnight UTC,
  // so bound the range in UTC business-calendar terms.
  const endDate = new Date(businessToday().getTime() + 86_400_000 - 1);
  const startDate = new Date(businessToday().getTime() - 30 * 86_400_000);

  const result = await getGroupedIncomeExpense({
    locationId,
    startDate,
    endDate,
    splitDeposit: false,
  });

  return (
    <SummaryClient
      initialData={serializeForClient(result) as unknown as SummaryData}
      locationId={locationId}
    />
  );
}
