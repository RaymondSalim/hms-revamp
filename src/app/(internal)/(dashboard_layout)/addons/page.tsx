import { getAddonsPage, ADDON_SORT_KEYS } from "@/app/_db/addons";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { AddonTable } from "./addon-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function AddonsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("addons.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: ADDON_SORT_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const addons = selectedLocationId
    ? await getAddonsPage(selectedLocationId, params)
    : { rows: [], total: 0, page: 1, pageSize: params.pageSize, pageCount: 1 };

  return (
    <AddonTable
      addons={serializeForClient(addons.rows) as never}
      locationId={selectedLocationId ?? 0}
      total={addons.total}
      page={addons.page}
      pageSize={addons.pageSize}
      pageCount={addons.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
