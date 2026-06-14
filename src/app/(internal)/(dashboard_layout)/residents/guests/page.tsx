import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { GuestTable } from "./guest-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function GuestsPage() {
  const { authorized } = await checkPermission("guests.view");
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

  const guests = await prisma.guest.findMany({
    where: {
      booking: { rooms: { location_id: selectedLocationId } },
    },
    include: {
      GuestStay: true,
      booking: {
        include: {
          rooms: true,
          tenants: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  // Get bookings for the location (for the guest form booking select)
  const bookings = await prisma.booking.findMany({
    where: { rooms: { location_id: selectedLocationId }, deletedAt: null },
    include: { rooms: true, tenants: true },
    orderBy: { createdAt: "desc" },
  });

  return (
    <GuestTable
      data={serializeForClient(guests) as never}
      bookings={serializeForClient(bookings) as never}
    />
  );
}
