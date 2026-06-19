import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { PaymentTable } from "./payment-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function PaymentsPage() {
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

  const payments = await prisma.payment.findMany({
    where: {
      bookings: {
        rooms: { location_id: selectedLocationId },
      },
      deletedAt: null,
    },
    include: {
      bookings: {
        include: {
          tenants: true,
          rooms: true,
        },
      },
      paymentBills: true,
      paymentstatuses: true,
    },
    orderBy: { payment_date: "desc" },
  });

  const paymentStatuses = await prisma.paymentStatus.findMany({
    orderBy: { id: "asc" },
  });

  const bookings = await prisma.booking.findMany({
    where: { rooms: { location_id: selectedLocationId }, deletedAt: null },
    include: { tenants: true, rooms: true, bills: { where: { deletedAt: null }, include: { bill_item: true, paymentBills: true } } },
    orderBy: { start_date: "desc" },
  });

  return (
    <PaymentTable
      payments={serializeForClient(payments) as never}
      paymentStatuses={serializeForClient(paymentStatuses) as never}
      bookings={serializeForClient(bookings) as never}
    />
  );
}
