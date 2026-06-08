import { getDurations } from "@/app/_db/durations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { DurationTable } from "./duration-table";

export default async function DurationsPage() {
  const durations = await getDurations();
  const data = serializeForClient(durations);

  return <DurationTable data={data} />;
}
