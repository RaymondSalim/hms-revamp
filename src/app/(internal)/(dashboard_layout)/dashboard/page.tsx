import { cookies } from "next/headers";
import {
  getCheckInOutCounts,
  getRoomStats,
  getOccupancyRate,
  getRecentPayments,
  getOutstandingBills,
  getUpcomingEvents,
} from "@/app/_db/dashboard";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { DashboardClient, type RecentPayment, type OutstandingBill, type UpcomingEvent } from "./dashboard-client";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function DashboardPage() {
  const { authorized } = await checkPermission("dashboard.view");
  if (!authorized) return <AccessDenied />;
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const locationId = locationCookie ? parseInt(locationCookie.value, 10) : 1;

  const [checkInOutCounts, roomStats, occupancy, recentPayments, outstandingBills, upcomingEvents] =
    await Promise.all([
      getCheckInOutCounts(locationId),
      getRoomStats(locationId),
      getOccupancyRate(locationId),
      getRecentPayments(locationId),
      getOutstandingBills(locationId),
      getUpcomingEvents(),
    ]);

  return (
    <DashboardClient
      checkInOutCounts={checkInOutCounts}
      roomStats={roomStats}
      occupancy={occupancy}
      recentPayments={serializeForClient(recentPayments) as unknown as RecentPayment[]}
      outstandingBills={serializeForClient(outstandingBills) as unknown as OutstandingBill[]}
      upcomingEvents={serializeForClient(upcomingEvents) as unknown as UpcomingEvent[]}
    />
  );
}
