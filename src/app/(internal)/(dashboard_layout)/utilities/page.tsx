import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { UtilityTable, type MeterReadingRow, type BookingOption } from "./utility-table";

export default async function UtilitiesPage() {
  const { authorized } = await checkPermission("bills.manage");
  if (!authorized) return <AccessDenied />;

  const [readings, bookings] = await Promise.all([
    prisma.meterReading.findMany({
      orderBy: { reading_date: "desc" },
      include: {
        booking: {
          include: { tenants: true, rooms: true },
        },
      },
    }),
    prisma.booking.findMany({
      where: { status_id: 2, deletedAt: null },
      orderBy: { id: "desc" },
      include: { tenants: true, rooms: true },
    }),
  ]);

  const rows: MeterReadingRow[] = readings.map((r) => ({
    id: r.id,
    booking_id: r.booking_id,
    utility_type: r.utility_type,
    reading_date: r.reading_date.toISOString(),
    reading_value: Number(r.reading_value),
    previous_value: r.previous_value === null ? null : Number(r.previous_value),
    rate_per_unit: Number(r.rate_per_unit),
    photo_proof: r.photo_proof,
    tenant_name: r.booking.tenants?.name ?? null,
    room_number: r.booking.rooms?.room_number ?? null,
  }));

  const bookingOptions: BookingOption[] = bookings.map((b) => ({
    id: b.id,
    tenant_name: b.tenants?.name ?? null,
    room_number: b.rooms?.room_number ?? null,
  }));

  return <UtilityTable readings={rows} bookings={bookingOptions} />;
}
