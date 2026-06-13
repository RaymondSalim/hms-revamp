import { getRoomsByLocation } from "@/app/_db/rooms";
import { getRoomTypes } from "@/app/_db/room-types";
import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { RoomTable } from "./room-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function AllRoomsPage() {
  const { authorized } = await checkPermission("rooms.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  const rooms = selectedLocationId ? await getRoomsByLocation(selectedLocationId) : [];
  const roomTypes = await getRoomTypes();
  const roomStatuses = await prisma.roomStatus.findMany({ orderBy: { status: "asc" } });

  return (
    <RoomTable
      rooms={serializeForClient(rooms)}
      roomTypes={serializeForClient(roomTypes)}
      roomStatuses={serializeForClient(roomStatuses)}
    />
  );
}
