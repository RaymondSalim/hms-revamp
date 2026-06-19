import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { LocationTable } from "./location-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function LocationsPage() {
  const { authorized } = await checkPermission("locations.view");
  if (!authorized) return <AccessDenied />;
  const locations = await getLocations();
  const data = serializeForClient(locations);

  return <LocationTable data={data} />;
}
