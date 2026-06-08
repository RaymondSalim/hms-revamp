import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAppSetup } from "@/app/_db/settings";
import { getLocations } from "@/app/_db/locations";
import { auth } from "@/app/_lib/auth";
import { LocationProvider } from "@/app/_context/location-context";
import { Sidebar } from "@/app/_components/sidebar";
import { Header } from "@/app/_components/header";

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
  const locations = await getLocations();
  const cookieStore = await cookies();
  const locationCookie = cookieStore.get("selectedLocationId");
  const initialLocationId = locationCookie ? parseInt(locationCookie.value, 10) : null;

  return (
    <LocationProvider initialLocations={locations} initialLocationId={initialLocationId}>
      <div className="flex h-screen overflow-hidden">
        <Sidebar
          userName={session?.user?.name ?? "Pengguna"}
          userRole={session?.user?.role_id === 1 ? "Admin" : "Staff"}
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
    </LocationProvider>
  );
}
