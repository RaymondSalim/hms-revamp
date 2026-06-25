import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { PaymentTable } from "./payment-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { getPaymentsPage, PAYMENT_SORT_KEYS } from "@/app/_db/payments";
import {
  parseTableParams,
  type RawSearchParams,
} from "@/app/_lib/util/table-params";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const { authorized } = await checkPermission("payments.view");
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

  const sp = await searchParams;
  const params = parseTableParams(sp, {
    allowedSortKeys: PAYMENT_SORT_KEYS,
    defaultSortBy: "payment_date",
    defaultSortDir: "desc",
  });

  const statusParam = (Array.isArray(sp.status) ? sp.status[0] : sp.status) === "pending"
    ? ("pending" as const)
    : undefined;

  const payments = await getPaymentsPage(selectedLocationId, params, { status: statusParam });

  const paymentStatuses = await prisma.paymentStatus.findMany({
    orderBy: { id: "asc" },
  });

  // Booking list powers the "add payment" dropdown (form reference data), not
  // the paginated table — load it in full.
  const bookings = await prisma.booking.findMany({
    where: { rooms: { location_id: selectedLocationId }, deletedAt: null },
    include: { tenants: true, rooms: true, bills: { where: { deletedAt: null }, include: { bill_item: true, paymentBills: true } } },
    orderBy: { start_date: "desc" },
  });

  return (
    <PaymentTable
      payments={serializeForClient(payments.rows) as never}
      paymentStatuses={serializeForClient(paymentStatuses) as never}
      bookings={serializeForClient(bookings) as never}
      total={payments.total}
      page={payments.page}
      pageSize={payments.pageSize}
      pageCount={payments.pageCount}
      search={params.search}
      sortBy={params.sortBy}
      sortDir={params.sortDir}
    />
  );
}
