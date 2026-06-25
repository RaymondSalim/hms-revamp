import { getBookingsPage, BOOKING_SORT_KEYS } from "@/app/_db/bookings";
import { getRoomsByLocation } from "@/app/_db/rooms";
import { getTenants } from "@/app/_db/tenant";
import { getDurations } from "@/app/_db/durations";
import { getAddonsByLocation } from "@/app/_db/addons";
import { getRoomTypeDurations } from "@/app/_db/room-types";
import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { BookingTable } from "./booking-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function BookingsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("bookings.view");
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

  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: BOOKING_SORT_KEYS,
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
  });
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const bookingFilter =
    first(sp.checkin) === "today"
      ? { checkin: "today" as const }
      : first(sp.expiring) === "1"
        ? { expiring: true }
        : {};

  const [bookings, rooms, tenants, durations, addons, roomTypeDurations, bookingStatuses] =
    await Promise.all([
      getBookingsPage(selectedLocationId, params, bookingFilter),
      getRoomsByLocation(selectedLocationId),
      getTenants(),
      getDurations(),
      getAddonsByLocation(selectedLocationId),
      getRoomTypeDurations(selectedLocationId),
      prisma.bookingStatus.findMany({ orderBy: { id: "asc" } }),
    ]);

  return (
    <BookingTable
      bookings={serializeForClient(bookings.rows) as never}
      rooms={serializeForClient(rooms) as never}
      tenants={serializeForClient(tenants) as never}
      durations={serializeForClient(durations) as never}
      addons={serializeForClient(addons) as never}
      roomTypeDurations={serializeForClient(roomTypeDurations) as never}
      bookingStatuses={serializeForClient(bookingStatuses) as never}
      total={bookings.total}
      page={bookings.page}
      pageSize={bookings.pageSize}
      pageCount={bookings.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
