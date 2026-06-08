import { getRoomTypes, getRoomTypeDurations } from "@/app/_db/room-types";
import { getDurations } from "@/app/_db/durations";
import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { RoomTypeTable } from "./room-type-table";
interface SerializedRoomTypeDuration {
  room_type_id: number;
  duration_id: number;
  location_id: number;
  suggested_price: string | null;
}

export default async function RoomTypesPage() {
  const roomTypes = await getRoomTypes();
  const durations = await getDurations();
  const locations = await getLocations();

  // Fetch room type durations for all locations to show in pricing grid
  const allRoomTypeDurations = [];
  for (const loc of locations) {
    const rtds = await getRoomTypeDurations(loc.id);
    allRoomTypeDurations.push(...rtds);
  }

  return (
    <RoomTypeTable
      roomTypes={serializeForClient(roomTypes)}
      durations={serializeForClient(durations)}
      locations={serializeForClient(locations)}
      roomTypeDurations={serializeForClient(allRoomTypeDurations) as unknown as SerializedRoomTypeDuration[]}
    />
  );
}
