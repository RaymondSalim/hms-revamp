import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { parseTableParams, type RawSearchParams } from "@/app/_lib/util/table-params";
import {
  getEmailLogsPage,
  EMAIL_LOG_SORT_KEYS,
  type EmailLogStatusFilter,
} from "@/app/_db/email-logs";
import { EmailLogsTable, type EmailLogRowData } from "./email-logs-table";

function parseStatus(raw: string | string[] | undefined): EmailLogStatusFilter | null {
  const v = Array.isArray(raw) ? raw[0] : raw;
  return v === "SUCCESS" || v === "FAIL" ? v : null;
}

export default async function EmailLogsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("roles.manage");
  if (!authorized) return <AccessDenied />;

  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: EMAIL_LOG_SORT_KEYS,
    defaultSortBy: "createdAt",
    defaultSortDir: "desc",
  });
  const status = parseStatus(sp.status);

  const logs = await getEmailLogsPage(params, status);

  return (
    <EmailLogsTable
      logs={serializeForClient(logs.rows) as unknown as EmailLogRowData[]}
      total={logs.total}
      page={logs.page}
      pageSize={logs.pageSize}
      pageCount={logs.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
      status={status}
    />
  );
}
