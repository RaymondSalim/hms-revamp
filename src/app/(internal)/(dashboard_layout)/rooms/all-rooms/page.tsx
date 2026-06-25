import { getRoomsPage, ROOM_SORT_KEYS } from "@/app/_db/rooms";
import { getRoomTypes } from "@/app/_db/room-types";
import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { RoomTable } from "./room-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function AllRoomsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("rooms.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: ROOM_SORT_KEYS,
    defaultSortBy: "room_number",
    defaultSortDir: "asc",
  });

  const rooms = selectedLocationId
    ? await getRoomsPage(selectedLocationId, params)
    : { rows: [], total: 0, page: 1, pageSize: params.pageSize, pageCount: 1 };
  const roomTypes = await getRoomTypes();
  const roomStatuses = await prisma.roomStatus.findMany({ orderBy: { status: "asc" } });

  return (
    <RoomTable
      rooms={serializeForClient(rooms.rows)}
      roomTypes={serializeForClient(roomTypes)}
      roomStatuses={serializeForClient(roomStatuses)}
      total={rooms.total}
      page={rooms.page}
      pageSize={rooms.pageSize}
      pageCount={rooms.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
