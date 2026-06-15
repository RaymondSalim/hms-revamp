import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";
import { AvailabilityClient } from "./availability-client";

export default async function AvailabilityPage() {
  const { authorized } = await checkPermission("rooms.view");
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

  return <AvailabilityClient locationId={selectedLocationId} />;
}
