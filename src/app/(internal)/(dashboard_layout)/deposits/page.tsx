import { getDepositsPage, DEPOSIT_SORT_KEYS } from "@/app/_db/deposits";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { DepositTable } from "./deposit-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function DepositsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("deposits.view");
  if (!authorized) return <AccessDenied />;
  const { selectedLocationId } = await resolveLocationContext();

  if (!selectedLocationId) {
    return (
      <div className="text-center py-12">
        <p style={{ color: "var(--color-text-secondary)" }}>
          Tidak ada lokasi tersedia. Silakan tambahkan lokasi terlebih dahulu.
        </p>
      </div>
    );
  }

  const params = parseTableParams(await searchParams, {
    allowedSortKeys: DEPOSIT_SORT_KEYS,
    defaultSortBy: "created",
    defaultSortDir: "desc",
  });

  const deposits = await getDepositsPage(selectedLocationId, params);

  return (
    <DepositTable
      deposits={serializeForClient(deposits.rows) as never}
      total={deposits.total}
      page={deposits.page}
      pageSize={deposits.pageSize}
      pageCount={deposits.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
