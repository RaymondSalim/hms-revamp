import { getDurations } from "@/app/_db/durations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { DurationTable } from "./duration-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function DurationsPage() {
  const { authorized } = await checkPermission("durations.view");
  if (!authorized) return <AccessDenied />;
  const durations = await getDurations();
  const data = serializeForClient(durations);

  return <DurationTable data={data} />;
}
