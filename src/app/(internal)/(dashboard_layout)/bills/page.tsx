import { prisma } from "@/app/_lib/prisma";
import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { cookies } from "next/headers";
import { BillTable } from "./bill-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function BillsPage() {
  const { authorized } = await checkPermission("bills.view");
  if (!authorized) return <AccessDenied />;
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

  const bills = await prisma.bill.findMany({
    where: {
      bookings: {
        rooms: { location_id: selectedLocationId },
      },
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
