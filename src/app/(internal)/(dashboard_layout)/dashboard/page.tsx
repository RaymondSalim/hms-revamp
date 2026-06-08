import { cookies } from "next/headers";
import {
  getCheckInOutCounts,
  getRoomStats,
  getRecentPayments,
  getOutstandingBills,
  getUpcomingEvents,
} from "@/app/_db/dashboard";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { DashboardClient, type RecentPayment, type OutstandingBill, type UpcomingEvent } from "./dashboard-client";

export default async function DashboardPage() {
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const locationId = locationCookie ? parseInt(locationCookie.value, 10) : 1;

  const [checkInOutCounts, roomStats, recentPayments, outstandingBills, upcomingEvents] =
    await Promise.all([
      getCheckInOutCounts(locationId),
      getRoomStats(locationId),
      getRecentPayments(locationId),
      getOutstandingBills(locationId),
      getUpcomingEvents(),
    ]);

  return (
    <DashboardClient
      checkInOutCounts={checkInOutCounts}
      roomStats={roomStats}
      recentPayments={serializeForClient(recentPayments) as unknown as RecentPayment[]}
      outstandingBills={serializeForClient(outstandingBills) as unknown as OutstandingBill[]}
      upcomingEvents={serializeForClient(upcomingEvents) as unknown as UpcomingEvent[]}
    />
  );
}
