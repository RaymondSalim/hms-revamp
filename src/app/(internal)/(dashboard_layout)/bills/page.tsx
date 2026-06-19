import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { BillTable } from "./bill-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function BillsPage() {
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

  const bills = await prisma.bill.findMany({
    where: {
      bookings: {
        rooms: { location_id: selectedLocationId },
      },
      deletedAt: null,
    },
    include: {
      bill_item: true,
      paymentBills: true,
      bookings: {
        include: {
          tenants: true,
          rooms: true,
        },
      },
    },
    orderBy: { due_date: "desc" },
  });

  return (
    <BillTable bills={serializeForClient(bills) as never} />
  );
}
