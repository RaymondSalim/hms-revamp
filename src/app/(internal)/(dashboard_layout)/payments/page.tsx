import { prisma } from "@/app/_lib/prisma";
import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { cookies } from "next/headers";
import { PaymentTable } from "./payment-table";

export default async function PaymentsPage() {
  const locations = await getLocations();
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const selectedLocationId = locationCookie
    ? parseInt(locationCookie.value, 10)
    : locations[0]?.id;

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
    where: { rooms: { location_id: selectedLocationId } },
    include: { tenants: true, rooms: true, bills: { include: { bill_item: true, paymentBills: true } } },
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
