import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import {
  getCheckInOutCounts,
  getRoomStats,
  getOccupancyRate,
  getRecentPayments,
  getUpcomingEvents,
} from "@/app/_db/dashboard";
import { getTodayTaskCounts, getActionQueue } from "@/app/_db/today-tasks";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { DashboardClient, type RecentPayment, type UpcomingEvent } from "./dashboard-client";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function DashboardPage() {
  const { authorized } = await checkPermission("dashboard.view");
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

  const [checkInOutCounts, roomStats, occupancy, recentPayments, upcomingEvents, todayTasks, actionQueue] =
    await Promise.all([
      getCheckInOutCounts(locationId),
      getRoomStats(locationId),
      getOccupancyRate(locationId),
      getRecentPayments(locationId),
      getUpcomingEvents(),
      getTodayTaskCounts(locationId),
      getActionQueue(locationId),
    ]);

  return (
    <DashboardClient
      checkInOutCounts={checkInOutCounts}
      roomStats={roomStats}
      occupancy={occupancy}
      recentPayments={serializeForClient(recentPayments) as unknown as RecentPayment[]}
      upcomingEvents={serializeForClient(upcomingEvents) as unknown as UpcomingEvent[]}
      todayTasks={todayTasks}
      actionQueue={actionQueue}
    />
  );
}
