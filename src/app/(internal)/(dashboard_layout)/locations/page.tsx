import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { LocationTable } from "./location-table";

export default async function LocationsPage() {
  const locations = await getLocations();
  const data = serializeForClient(locations);

  return <LocationTable data={data} />;
}
