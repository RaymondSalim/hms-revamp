import { getTenants } from "@/app/_db/tenant";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { TenantTable } from "./tenant-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function TenantsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { authorized } = await checkPermission("tenants.view");
  if (!authorized) return <AccessDenied />;
  const tenants = await getTenants();
  const serialized = serializeForClient(tenants);
  const { edit } = await searchParams;

  return <TenantTable data={serialized} editId={edit} />;
}
