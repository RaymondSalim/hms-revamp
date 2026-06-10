import { getTenants } from "@/app/_db/tenant";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { TenantTable } from "./tenant-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function TenantsPage() {
  const { authorized } = await checkPermission("tenants.view");
  if (!authorized) return <AccessDenied />;
  const tenants = await getTenants();
  const serialized = serializeForClient(tenants);

  return <TenantTable data={serialized} />;
}
