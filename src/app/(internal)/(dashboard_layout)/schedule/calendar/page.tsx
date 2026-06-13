import { resolveLocationContext } from "@/app/_lib/util/location-scope";
import { getCalendarEventsAction } from "./calendar-action";
import { CalendarClient } from "./calendar-client";
import { checkPermission } from "@/app/_lib/rbac";
import { AccessDenied } from "@/app/_components/access-denied";

export default async function CalendarPage() {
  const { authorized } = await checkPermission("calendar.view");
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

  const events = await getCalendarEventsAction(selectedLocationId);

  return <CalendarClient events={events} />;
}
