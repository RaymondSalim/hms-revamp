import { prisma } from "@/app/_lib/prisma";
import { getLocations } from "@/app/_db/locations";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { cookies } from "next/headers";
import { DepositTable } from "./deposit-table";

export default async function DepositsPage() {
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

  const deposits = await prisma.deposit.findMany({
    where: {
      booking: {
        rooms: { location_id: selectedLocationId },
      },
    },
    include: {
      booking: {
        include: {
          tenants: true,
          rooms: true,
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return <DepositTable deposits={serializeForClient(deposits) as never} />;
}
