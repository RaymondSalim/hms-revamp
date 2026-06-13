import { getAddonsByLocation } from "@/app/_db/addons";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { AddonTable } from "./addon-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function AddonsPage() {
  const { authorized } = await checkPermission("addons.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  const addons = selectedLocationId
    ? await getAddonsByLocation(selectedLocationId)
    : [];

  return (
    <AddonTable
      addons={serializeForClient(addons) as never}
      locationId={selectedLocationId ?? 0}
    />
  );
}
