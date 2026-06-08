import { cookies } from "next/headers";
import { getLocations } from "@/app/_db/locations";
import { getCalendarEventsAction } from "./calendar-action";
import { CalendarClient } from "./calendar-client";

export default async function CalendarPage() {
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

  const events = await getCalendarEventsAction(selectedLocationId);

  return <CalendarClient events={events} />;
}
