import { getTenants } from "@/app/_db/tenant";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { TenantTable } from "./tenant-table";

export default async function TenantsPage() {
  const tenants = await getTenants();
  const serialized = serializeForClient(tenants);

  return <TenantTable data={serialized} />;
}
