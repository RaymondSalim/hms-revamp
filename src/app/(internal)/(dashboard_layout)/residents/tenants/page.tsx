import { getTenantsPage, TENANT_SORT_KEYS } from "@/app/_db/tenant";
import { getTenantById } from "@/app/_db/tenant";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { TenantTable } from "./tenant-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams & { edit?: string }>;
}) {
  const { authorized } = await checkPermission("tenants.view");
  if (!authorized) return <AccessDenied />;

  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: TENANT_SORT_KEYS,
    defaultSortBy: "name",
    defaultSortDir: "asc",
  });

  const tenants = await getTenantsPage(params);

  // The tenant targeted by ?edit= may not be on the current page; fetch it so
  // the edit modal can still open. getTenantById returns relations the table
  // row type ignores — serialize and pass through.
  const editTarget = sp.edit ? await getTenantById(sp.edit) : null;

  return (
    <TenantTable
      data={serializeForClient(tenants.rows) as never}
      editTarget={editTarget ? (serializeForClient(editTarget) as never) : null}
      total={tenants.total}
      page={tenants.page}
      pageSize={tenants.pageSize}
      pageCount={tenants.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
