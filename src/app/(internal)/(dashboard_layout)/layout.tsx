import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAppSetup, getCompanyName, getCompanyImage } from "@/app/_db/settings";
import { getLocationsForUser } from "@/app/_db/locations";
import { auth } from "@/app/_lib/auth";
import { getScopedLocationIds, pickSelectedLocationId } from "@/app/_lib/util/location-scope";
import { getUserPermissions } from "@/app/_lib/rbac";
import { LocationProvider } from "@/app/_context/location-context";
import { PermissionsProvider } from "@/app/_context/permissions-context";
import { Sidebar } from "@/app/_components/sidebar";
import { Header } from "@/app/_components/header";
import { SessionRefresh } from "@/app/_components/session-refresh";
import { TourProvider } from "@/app/_components/tour/tour-provider";
import { CommandPalette } from "@/app/_components/command-palette";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const isSetup = await getAppSetup();
  if (!isSetup) {
    redirect("/first-time-setup");
  }

  const session = await auth();
  const permissions = await getUserPermissions();
  const scope = await getScopedLocationIds();
  const locations = await getLocationsForUser(scope);
  const companyName = await getCompanyName();
  const companyImage = await getCompanyImage();
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const requested = locationCookie ? parseInt(locationCookie.value, 10) : null;
  const initialLocationId = pickSelectedLocationId(
    scope,
    requested,
    locations.map((l) => l.id)
  );

  return (
    <PermissionsProvider permissions={[...permissions]}>
      <LocationProvider initialLocations={locations} initialLocationId={initialLocationId}>
        <TourProvider>
          <SessionRefresh />
          <CommandPalette />
          <div className="flex h-screen overflow-hidden">
            <Sidebar
              userName={session?.user?.name ?? "Pengguna"}
              userRole={session?.user?.role_id === 1 ? "Admin" : "Staff"}
              companyName={companyName}
              companyImage={companyImage}
              permissions={[...permissions]}
            />
            <div className="flex flex-1 flex-col overflow-hidden">
              <Header />
              <main
                className="flex-1 overflow-y-auto p-6"
                style={{ backgroundColor: "var(--color-bg-primary)" }}
              >
                {children}
              </main>
            </div>
          </div>
        </TourProvider>
      </LocationProvider>
    </PermissionsProvider>
  );
}
