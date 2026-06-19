import { prisma } from "@/app/_lib/prisma";
import { serializeForClient } from "@/app/_lib/util/serialize";
import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { DepositTable } from "./deposit-table";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function DepositsPage() {
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
