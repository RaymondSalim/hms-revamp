"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

interface SidebarProps {
  userName: string;
  userRole: string;
  permissions: string[];
}

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
  permission?: string;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    items: [
      {
        label: "Dashboard",
        href: "/dashboard",
        icon: <DashboardIcon />,
        permission: "dashboard.view",
      },
      {
        label: "Pemesanan",
        href: "/bookings",
        icon: <BookingsIcon />,
        permission: "bookings.view",
      },
      {
        label: "Tagihan",
        href: "/bills",
        icon: <BillsIcon />,
        permission: "bills.view",
      },
      {
        label: "Utilitas",
        href: "/utilities",
        icon: <BillsIcon />,
        permission: "bills.manage",
      },
      {
        label: "Pembayaran",
        href: "/payments",
        icon: <PaymentsIcon />,
        permission: "payments.view",
      },
      {
        label: "Deposit",
        href: "/deposits",
        icon: <DepositIcon />,
        permission: "deposits.view",
      },
    ],
  },
  {
    title: "Penghuni",
    items: [
      {
        label: "Penyewa",
        href: "/residents/tenants",
        icon: <TenantsIcon />,
        permission: "tenants.view",
      },
      {
        label: "Tamu",
        href: "/residents/guests",
        icon: <GuestsIcon />,
        permission: "guests.view",
      },
    ],
  },
  {
    title: "Kamar",
    items: [
      {
        label: "Semua Kamar",
        href: "/rooms/all-rooms",
        icon: <RoomsIcon />,
        permission: "rooms.view",
      },
      {
        label: "Tipe Kamar",
        href: "/rooms/room-types",
        icon: <RoomTypesIcon />,
        permission: "room_types.view",
      },
      {
        label: "Durasi",
        href: "/rooms/durations",
        icon: <DurationsIcon />,
        permission: "durations.view",
      },
    ],
  },
  {
    items: [
      {
        label: "Add-on",
        href: "/addons",
        icon: <AddonsIcon />,
        permission: "addons.view",
      },
    ],
  },
  {
    title: "Keuangan",
    items: [
      {
        label: "Ringkasan",
        href: "/financials/summary",
        icon: <FinancialsIcon />,
        permission: "financials.view",
      },
      {
        label: "Ekspor",
        href: "/financials/export",
        icon: <ExportIcon />,
        permission: "financials.export",
      },
    ],
  },
  {
    title: "Jadwal",
    items: [
      {
        label: "Kalender",
        href: "/schedule/calendar",
        icon: <CalendarIcon />,
        permission: "calendar.view",
      },
    ],
  },
  {
    title: "Pengaturan",
    items: [
      {
        label: "Lokasi",
        href: "/locations",
        icon: <LocationsIcon />,
        permission: "locations.view",
      },
      {
        label: "Pengguna",
        href: "/settings/users",
        icon: <UsersIcon />,
        permission: "users.view",
      },
      {
        label: "Hak Akses",
        href: "/settings/roles",
        icon: <RolesIcon />,
        permission: "roles.manage",
      },
      {
        label: "Kebijakan Tagihan",
        href: "/settings/billing",
        icon: <RolesIcon />,
        permission: "roles.manage",
      },
    ],
  },
];

export function Sidebar({ userName, userRole, permissions }: SidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const permSet = new Set(permissions);

  const filteredSections = navSections
    .map((section) => ({
      ...section,
      items: section.items.filter(
        (item) => !item.permission || permSet.has(item.permission)
      ),
    }))
    .filter((section) => section.items.length > 0);

  return (
    <>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Mobile toggle button - exposed for header to control */}
      <button
        id="sidebar-mobile-toggle"
        className="hidden"
        onClick={() => setMobileOpen((prev) => !prev)}
        aria-label="Toggle sidebar"
      />

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-[260px] flex flex-col
          transition-transform duration-150 ease-in-out
          md:relative md:translate-x-0
          ${mobileOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        style={{ backgroundColor: "var(--color-bg-sidebar)" }}
      >
        {/* Logo area */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-white/10">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            H
          </div>
          <span
            className="text-lg font-semibold tracking-tight"
            style={{
              color: "var(--color-text-sidebar)",
              fontFamily: "var(--font-display), serif",
            }}
          >
            HMS
          </span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {filteredSections.map((section, sIdx) => (
            <div key={sIdx} className={sIdx > 0 ? "pt-4" : ""}>
              {section.title && (
                <p
                  className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--color-text-sidebar-muted)" }}
                >
                  {section.title}
                </p>
              )}
              {section.items.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`
                      group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                      transition-all duration-150
                      ${isActive ? "border-l-[3px]" : "border-l-[3px] border-transparent"}
                    `}
                    style={{
                      backgroundColor: isActive
                        ? "var(--color-bg-sidebar-active)"
                        : undefined,
                      borderLeftColor: isActive ? "var(--color-accent)" : "transparent",
                      color: isActive
                        ? "var(--color-text-sidebar)"
                        : "var(--color-text-sidebar-muted)",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "var(--color-bg-sidebar-hover)";
                        e.currentTarget.style.color = "var(--color-text-sidebar)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isActive) {
                        e.currentTarget.style.backgroundColor = "transparent";
                        e.currentTarget.style.color = "var(--color-text-sidebar-muted)";
                      }
                    }}
                  >
                    <span className="w-5 h-5 flex-shrink-0">{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User section at bottom */}
        <div
          className="px-4 py-4 border-t border-white/10 flex items-center gap-3"
        >
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold"
            style={{
              backgroundColor: "var(--color-bg-sidebar-hover)",
              color: "var(--color-text-sidebar)",
            }}
          >
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p
              className="text-sm font-medium truncate"
              style={{ color: "var(--color-text-sidebar)" }}
            >
              {userName}
            </p>
            <span
              className="inline-block text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "white",
              }}
            >
              {userRole}
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

// Toggle function for the header to use
export function toggleSidebar() {
  const btn = document.getElementById("sidebar-mobile-toggle");
  if (btn) btn.click();
}

// --- SVG Icons (minimal, consistent 20x20) ---

function DashboardIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" />
    </svg>
  );
}

function BookingsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  );
}

function BillsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
    </svg>
  );
}

function PaymentsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
      <path fillRule="evenodd" d="M18 9H2v5a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm5-1a1 1 0 100 2h1a1 1 0 100-2H9z" clipRule="evenodd" />
    </svg>
  );
}

function DepositIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd" />
    </svg>
  );
}

function TenantsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
    </svg>
  );
}

function GuestsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
    </svg>
  );
}

function RoomsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5 8.445v4.722a1 1 0 00.553.894l4 2a1 1 0 00.894 0l4-2A1 1 0 0015 13.167V8.445l2.394-1.025a1 1 0 000-1.84l-7-3z" />
    </svg>
  );
}

function RoomTypesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M7 3a1 1 0 000 2h6a1 1 0 100-2H7zM4 7a1 1 0 011-1h10a1 1 0 110 2H5a1 1 0 01-1-1zM2 11a2 2 0 012-2h12a2 2 0 012 2v4a2 2 0 01-2 2H4a2 2 0 01-2-2v-4z" />
    </svg>
  );
}

function DurationsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
    </svg>
  );
}

function AddonsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
    </svg>
  );
}

function FinancialsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 0l-2 2a1 1 0 101.414 1.414L8 10.414l1.293 1.293a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}

function ExportIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm3.293-7.707a1 1 0 011.414 0L9 10.586V3a1 1 0 112 0v7.586l1.293-1.293a1 1 0 111.414 1.414l-3 3a1 1 0 01-1.414 0l-3-3a1 1 0 010-1.414z" clipRule="evenodd" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
    </svg>
  );
}

function LocationsIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
    </svg>
  );
}

function UsersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
    </svg>
  );
}

function RolesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
      <path fillRule="evenodd" d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
    </svg>
  );
}
