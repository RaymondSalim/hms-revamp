import { getBookingsByLocation } from "@/app/_db/bookings";
import { getRoomsByLocation } from "@/app/_db/rooms";
import { getTenants } from "@/app/_db/tenant";
import { getDurations } from "@/app/_db/durations";
import { getAddonsByLocation } from "@/app/_db/addons";
import { getRoomTypeDurations } from "@/app/_db/room-types";
import { getLocations } from "@/app/_db/locations";
import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { cookies } from "next/headers";
import { BookingTable } from "./booking-table";

export default async function BookingsPage() {
  const locations = await getLocations();
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const selectedLocationId = locationCookie
    ? parseInt(locationCookie.value, 10)
    : locations[0]?.id;

  if (!selectedLocationId) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--color-text-secondary)" }}>
          Tidak ada lokasi tersedia. Silakan tambahkan lokasi terlebih dahulu.
        </p>
      </div>
    );
  }

  const [bookings, rooms, tenants, durations, addons, roomTypeDurations, bookingStatuses] =
    await Promise.all([
      getBookingsByLocation(selectedLocationId),
      getRoomsByLocation(selectedLocationId),
      getTenants(),
      getDurations(),
      getAddonsByLocation(selectedLocationId),
      getRoomTypeDurations(selectedLocationId),
      prisma.bookingStatus.findMany({ orderBy: { id: "asc" } }),
    ]);

  return (
    <BookingTable
      bookings={serializeForClient(bookings) as never}
      rooms={serializeForClient(rooms) as never}
      tenants={serializeForClient(tenants) as never}
      durations={serializeForClient(durations) as never}
      addons={serializeForClient(addons) as never}
      roomTypeDurations={serializeForClient(roomTypeDurations) as never}
      bookingStatuses={serializeForClient(bookingStatuses) as never}
    />
  );
}
