import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { BillTable } from "./bill-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { getBillsPage, BILL_SORT_KEYS } from "@/app/_db/bills";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function BillsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("bills.view");
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
    allowedSortKeys: BILL_SORT_KEYS,
    defaultSortBy: "due_date",
    defaultSortDir: "desc",
  });

  const bills = await getBillsPage(selectedLocationId, params);

  return (
    <BillTable
      bills={serializeForClient(bills.rows) as never}
      total={bills.total}
      page={bills.page}
      pageSize={bills.pageSize}
      pageCount={bills.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
