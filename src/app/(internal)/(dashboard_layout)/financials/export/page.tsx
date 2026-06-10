import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { ExportClient } from "./export-client";

export default async function ExportPage() {
  const { authorized } = await checkPermission("financials.export");
  if (!authorized) return <AccessDenied />;

  return <ExportClient />;
}
