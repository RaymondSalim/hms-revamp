import { cookies } from "next/headers";
import { getGroupedIncomeExpense } from "@/app/_db/dashboard";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { SummaryClient, type SummaryData } from "./summary-client";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function FinancialSummaryPage() {
  const { authorized } = await checkPermission("financials.view");
  if (!authorized) return <AccessDenied />;
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const locationId = locationCookie ? parseInt(locationCookie.value, 10) : 1;

  // Default period: last 30 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 30);
  startDate.setHours(0, 0, 0, 0);
  endDate.setHours(23, 59, 59, 999);

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
