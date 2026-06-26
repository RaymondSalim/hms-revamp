import { prisma } from "@/app/_lib/prisma";
import { Prisma } from "@prisma/client";
import type { LocationScope } from "@/app/_lib/util/location-scope";
import type { Permission } from "@/app/_lib/rbac";

export type SearchType = "tenant" | "booking" | "bill" | "room";

export interface SearchHit {
  id: string;
  type: SearchType;
  label: string;
  sublabel: string;
  href: string;
  locationId: number | null;
  locationName: string | null;
}

export interface SearchResults {
  tenants: SearchHit[];
  bookings: SearchHit[];
  bills: SearchHit[];
  rooms: SearchHit[];
}

const TAKE = 5;

/** location_id IN scope clause, or undefined when scope is null (admin = all). */
function locFilter(scope: LocationScope): { in: number[] } | undefined {
  return scope === null ? undefined : { in: scope };
}

export async function globalSearch(
  scope: LocationScope,
  rawTerm: string,
  permissions: Set<Permission>
): Promise<SearchResults> {
  const term = rawTerm.trim();
  const empty: SearchResults = { tenants: [], bookings: [], bills: [], rooms: [] };
  if (!term) return empty;

  const ci = (s: string) => ({ contains: s, mode: "insensitive" as const });
  const q = encodeURIComponent(term);
  const scopeIds = locFilter(scope);

  const [tenants, rooms, bookings, bills] = await Promise.all([
    // Tenants — global (no location filter).
    permissions.has("tenants.view")
      ? prisma.tenant.findMany({
          where: {
            OR: [
              { name: ci(term) },
              { email: ci(term) },
              { phone: ci(term) },
              { id_number: ci(term) },
            ],
          },
          orderBy: { name: "asc" },
          take: TAKE,
        })
      : Promise.resolve([]),

    // Rooms — scoped by location_id.
    permissions.has("rooms.view")
      ? prisma.room.findMany({
          where: {
            ...(scopeIds ? { location_id: scopeIds } : {}),
            OR: [{ room_number: ci(term) }, { roomtypes: { type: ci(term) } }],
          },
          include: { roomtypes: true, locations: true },
          orderBy: { room_number: "asc" },
          take: TAKE,
        })
      : Promise.resolve([]),

    // Bookings — scoped via rooms.location_id.
    permissions.has("bookings.view")
      ? prisma.booking.findMany({
          where: {
            deletedAt: null,
            ...(scopeIds ? { rooms: { location_id: scopeIds } } : {}),
            OR: [
              { tenants: { name: ci(term) } },
              { rooms: { room_number: ci(term) } },
            ],
          },
          include: { tenants: true, rooms: { include: { locations: true } } },
          orderBy: { createdAt: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),

    // Bills — scoped via bookings.rooms.location_id.
    permissions.has("bills.view")
      ? prisma.bill.findMany({
          where: {
            deletedAt: null,
            ...(scopeIds ? { bookings: { rooms: { location_id: scopeIds } } } : {}),
            OR: [
              { invoice_number: ci(term) },
              { description: ci(term) },
              { bookings: { tenants: { name: ci(term) } } },
              { bookings: { rooms: { room_number: ci(term) } } },
            ],
          },
          include: { bookings: { include: { tenants: true, rooms: { include: { locations: true } } } } },
          orderBy: { due_date: "desc" },
          take: TAKE,
        })
      : Promise.resolve([]),
  ]);

  return {
    tenants: tenants.map((t) => ({
      id: t.id,
      type: "tenant" as const,
      label: t.name,
      sublabel: t.email ?? t.phone ?? t.id_number,
      href: `/residents/tenants/${t.id}`,
      locationId: null,
      locationName: null,
    })),
    rooms: rooms.map((r) => ({
      id: String(r.id),
      type: "room" as const,
      label: r.room_number,
      sublabel: r.roomtypes?.type ?? "-",
      href: `/rooms/all-rooms?q=${q}`,
      locationId: r.location_id,
      locationName: r.locations?.name ?? null,
    })),
    bookings: bookings.map((b) => ({
      id: String(b.id),
      type: "booking" as const,
      label: `${b.rooms?.room_number ?? "-"} · ${b.tenants?.name ?? "-"}`,
      sublabel: b.tenants?.name ?? "-",
      href: `/bookings?q=${q}`,
      locationId: b.rooms?.location_id ?? null,
      locationName: b.rooms?.locations?.name ?? null,
    })),
    bills: bills.map((b) => ({
      id: String(b.id),
      type: "bill" as const,
      label: b.invoice_number ?? `Tagihan #${b.id}`,
      sublabel: `${b.bookings?.rooms?.room_number ?? "-"} · ${b.bookings?.tenants?.name ?? "-"}`,
      href: `/bills?q=${q}`,
      locationId: b.bookings?.rooms?.location_id ?? null,
      locationName: b.bookings?.rooms?.locations?.name ?? null,
    })),
  };
}
