import { prisma } from "@/app/_lib/prisma";
import { getGuestsPage, GUEST_SORT_KEYS } from "@/app/_db/guests";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { GuestTable } from "./guest-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function GuestsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
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

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: GUEST_SORT_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const [guests, bookings] = await Promise.all([
    getGuestsPage(selectedLocationId, params),
    prisma.booking.findMany({
      where: { rooms: { location_id: selectedLocationId }, deletedAt: null },
      include: { rooms: true, tenants: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return (
    <GuestTable
      data={serializeForClient(guests.rows) as never}
      bookings={serializeForClient(bookings) as never}
      total={guests.total}
      page={guests.page}
      pageSize={guests.pageSize}
      pageCount={guests.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
