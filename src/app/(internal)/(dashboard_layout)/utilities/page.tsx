import { getUtilitiesPage, UTILITY_SORT_KEYS } from "@/app/_db/utilities";
import { prisma } from "@/app/_lib/prisma";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { UtilityTable, type MeterReadingRow, type BookingOption } from "./utility-table";
import { BOOKING_STATUS } from "@/app/_lib/util/status";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function UtilitiesPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("bills.manage");
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

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: UTILITY_SORT_KEYS,
    defaultSortBy: "reading_date",
    defaultSortDir: "desc",
  });

  const [readings, bookings] = await Promise.all([
    getUtilitiesPage(selectedLocationId, params),
    prisma.booking.findMany({
      where: {
        status_id: BOOKING_STATUS.ACTIVE,
        deletedAt: null,
        rooms: { location_id: selectedLocationId },
      },
      orderBy: { id: "desc" },
      include: { tenants: true, rooms: true },
    }),
  ]);

  const rows: MeterReadingRow[] = readings.rows.map((r) => ({
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

  return (
    <UtilityTable
      readings={rows}
      bookings={bookingOptions}
      total={readings.total}
      page={readings.page}
      pageSize={readings.pageSize}
      pageCount={readings.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
