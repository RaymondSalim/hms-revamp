import { getAddonsByLocation } from "@/app/_db/addons";
import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { cookies } from "next/headers";
import { AddonTable } from "./addon-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function AddonsPage() {
  const { authorized } = await checkPermission("addons.view");
  if (!authorized) return <AccessDenied />;
  const locations = await getLocations();
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const selectedLocationId = locationCookie
    ? parseInt(locationCookie.value, 10)
    : locations[0]?.id;

  const addons = selectedLocationId
    ? await getAddonsByLocation(selectedLocationId)
    : [];

  return (
    <AddonTable
      addons={serializeForClient(addons)}
      locationId={selectedLocationId ?? 0}
    />
  );
}
